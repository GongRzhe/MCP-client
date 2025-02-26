#!/usr/bin/env python
"""
MCP Client API - Backend Service
Provides REST API endpoints for the MCP Client frontend to interact with AI providers and MCP servers
"""

from flask import Flask, request, jsonify
import asyncio
import os
import json
import sys
import logging
import requests
from typing import Dict, Any, List, Optional
from functools import wraps
from flask_cors import CORS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('mcp_api')

# Import MCP Client
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
try:
    from mcp import StdioServerParameters
    from mcp.client.session import ClientSession
    from mcp.client.stdio import stdio_client
except ImportError:
    logger.error("Error: Official MCP SDK not found. Please install it with 'pip install mcp'.")
    sys.exit(1)

# Import AI provider SDKs
try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logger.warning("Anthropic SDK not found. Anthropic integration will be disabled.")

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# MCP servers configuration
try:
    with open(os.path.join(os.path.dirname(__file__), 'config.json'), 'r') as config_file:
        MCP_SERVERS_CONFIG = json.load(config_file)
    logger.info("Successfully loaded server configurations from config.json")
except Exception as e:
    logger.error(f"Error loading config.json: {e}")
    # Fallback to default configuration
    MCP_SERVERS_CONFIG = {
        "mcpServers": {
            "doc-qa-server": {
                "command": "node",
                "args": [
                    "C:\\Users\\Administrator\\Documents\\Cline\\MCP\\doc-qa-server\\build\\index.js"
                ],
                "env": {
                    "API_ENDPOINT": "http://127.0.0.1:7860/api/v1/run/480ec7b3-29d2-4caa-b03b-e74118f35fac"
                }
            }
            # ... other server configurations removed for brevity
        }
    }
    logger.info("Using default server configurations")

# Initialize Flask app
app = Flask(__name__, static_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), 'front'), static_url_path='')
CORS(app)  # Enable CORS for all routes

# Root route - redirect to frontend index.html
@app.route('/')
def index():
    return app.send_static_file('index.html')

# Serve frontend files
@app.route('/<path:path>')
def serve_frontend(path):
    try:
        # First try to serve from the static folder (frontend)
        return app.send_static_file(path)
    except:
        # If file not found, return 404
        return f"File {path} not found", 404

# Serve test.html
@app.route('/test.html')
def test_interface():
    try:
        with open(os.path.join(os.path.dirname(__file__), 'test.html'), 'r') as file:
            return file.read()
    except FileNotFoundError:
        return "Test interface file not found. Please ensure test.html exists in the back directory.", 404

# Initialize MCP Client - custom wrapper for the mcp SDK
class MCPClient:
    """
    Wrapper class for MCP client functionality using the official MCP SDK
    """
    def __init__(self):
        """Initialize the MCP client"""
        self.sessions = {}
        self.exit_stacks = {}
        self.anthropic = None
        
        # Check if Anthropic API key is set
        anthropic_api_key = os.environ.get('ANTHROPIC_API_KEY')
        if anthropic_api_key and ANTHROPIC_AVAILABLE:
            self.anthropic = Anthropic(api_key=anthropic_api_key)
    
    async def list_servers(self):
        """List all available MCP servers"""
        logger.info("Available MCP servers:")
        
        # Use the server configurations from MCP_SERVERS_CONFIG
        servers = []
        for server_name, server_config in MCP_SERVERS_CONFIG["mcpServers"].items():
            # Skip disabled servers
            if server_config.get("disabled", False):
                continue
                
            status = "Available"
            servers.append({
                "name": server_name, 
                "config": server_config,
                "status": status
            })
            logger.info(f"- {server_name}: {status}")
        
        return servers
    
    async def connect_to_server(self, server_name):
        """Connect to a specific MCP server"""
        try:
            logger.info(f"Connecting to server: {server_name}")
            
            # Get server config from MCP_SERVERS_CONFIG
            server_config = MCP_SERVERS_CONFIG["mcpServers"].get(server_name)
            if not server_config:
                logger.error(f"Unknown server: {server_name}")
                return False
            
            # Skip if server is disabled
            if server_config.get("disabled", False):
                logger.error(f"Server {server_name} is disabled")
                return False
            
            # Check if already connected
            if server_name in self.sessions:
                logger.info(f"Already connected to {server_name}")
                return True
            
            # Clean up any existing resources for this server before creating new ones
            if server_name in self.exit_stacks:
                try:
                    old_stack = self.exit_stacks[server_name]
                    del self.exit_stacks[server_name]
                    try:
                        await asyncio.wait_for(old_stack.aclose(), 0.5)
                    except Exception as e:
                        logger.warning(f"Error cleaning up previous resources for {server_name}: {e}")
                except Exception as e:
                    logger.warning(f"Error handling previous exit stack for {server_name}: {e}")
            
            # Create exit stack for resource management
            from contextlib import AsyncExitStack
            exit_stack = AsyncExitStack()
            self.exit_stacks[server_name] = exit_stack
            
            # Handle node-based commands (npx, npm, node) on Windows
            command = server_config["command"]
            args = server_config["args"].copy()  # Create a copy to avoid modifying the original
            
            # Special handling for the terminal-controller to fix the asyncio issue
            if server_name == "terminal-controller":
                logger.info("Using special handling for terminal-controller server")
                # Skip the terminal-controller server for now due to asyncio compatibility issues
                logger.warning(f"Skipping terminal-controller server due to asyncio compatibility issues")
                return False
            
            # Set environment variables from the server configuration
            if "env" in server_config and server_config["env"]:
                env_vars = os.environ.copy()
                for key, value in server_config["env"].items():
                    env_vars[key] = value
                    logger.info(f"Set environment variable: {key}={value}")
            else:
                env_vars = None
            
            if sys.platform.startswith('win'):
                # Try to find npm and node executables
                import shutil
                node_path = shutil.which("node")
                npm_path = shutil.which("npm")
                npx_path = shutil.which("npx")
                
                logger.info(f"Node path: {node_path}")
                logger.info(f"NPM path: {npm_path}")
                logger.info(f"NPX path: {npx_path}")
                
                # Handle different command types on Windows
                if command == "npx" and npm_path:
                    # Use npm exec instead of npx for better Windows compatibility
                    logger.info(f"Using npm exec instead of npx for better Windows compatibility")
                    command = npm_path
                    # Transform npx -y package to npm exec package
                    new_args = ["exec"]
                    if "-y" in args:
                        args.remove("-y")
                        new_args.append("--yes")
                    new_args.extend(args)
                    args = new_args
                elif command == "node" and node_path:
                    # Use full path to node
                    command = node_path
                
                # For legacy batch file configs that might still be in the system
                elif command == "cmd.exe" and "/c" in args and any(bat_file in (args[1] if len(args) > 1 else "") for bat_file in ["run_brave_search.bat", "run_github.bat", "run_puppeteer.bat", "run_memory.bat", "run_gmail.bat"]):
                    logger.info(f"Legacy batch file configuration detected. Using direct npm exec instead.")
                    # Convert batch file execution to npm exec
                    bat_file = args[1]
                    if "brave_search" in bat_file and npm_path:
                        command = npm_path
                        args = ["exec", "--yes", "@modelcontextprotocol/server-brave-search"]
                    elif "github" in bat_file and npm_path:
                        command = npm_path
                        args = ["exec", "--yes", "@modelcontextprotocol/server-github"]
                    elif "puppeteer" in bat_file and npm_path:
                        command = npm_path
                        args = ["exec", "--yes", "@modelcontextprotocol/server-puppeteer"]
                    elif "memory" in bat_file and npm_path:
                        command = npm_path
                        args = ["exec", "--yes", "@modelcontextprotocol/server-memory"]
                    elif "gmail" in bat_file and npm_path:
                        command = npm_path
                        args = ["exec", "@gongrzhe/server-gmail-autoauth-mcp"]
            
            # Set up server parameters using config
            server_params = StdioServerParameters(
                command=command,
                args=args,
                env=env_vars
            )
            
            # Use a timeout for connection to avoid hanging
            try:
                # Create client connection with timeout
                logger.info(f"Starting {command} with args: {args}")
                
                async def setup_connection():
                    try:
                        stdio_transport = await exit_stack.enter_async_context(stdio_client(server_params))
                        stdin, send = stdio_transport
                        
                        # Create and initialize client session
                        session = await exit_stack.enter_async_context(ClientSession(stdin, send))
                        await session.initialize()
                        return session
                    except RuntimeError as re:
                        if "cancel scope in a different task" in str(re):
                            logger.warning(f"Suppressing asyncio task scope error in stdio_client: {re}")
                            # Re-raise as CancelledError which is handled more gracefully
                            raise asyncio.CancelledError("Operation cancelled due to task scope conflict")
                        raise
                
                # Set a timeout for the connection process
                try:
                    session = await asyncio.wait_for(setup_connection(), 10.0)  # 10-second timeout
                    self.sessions[server_name] = session
                    logger.info(f"Successfully connected to {server_name}")
                    return True
                except asyncio.CancelledError as ce:
                    logger.error(f"Connection to {server_name} was cancelled: {ce}")
                    # Ensure we clean up properly
                    if server_name in self.exit_stacks:
                        try:
                            failed_stack = self.exit_stacks[server_name]
                            del self.exit_stacks[server_name]
                            await failed_stack.aclose()
                        except Exception as cleanup_err:
                            logger.warning(f"Error cleaning up after cancellation for {server_name}: {cleanup_err}")
                    return False
                
            except asyncio.TimeoutError:
                logger.error(f"Timeout connecting to {server_name} after 10 seconds")
                # Clean up exit stack if connection timed out
                if server_name in self.exit_stacks:
                    try:
                        failed_stack = self.exit_stacks[server_name]
                        del self.exit_stacks[server_name]
                        await failed_stack.aclose()
                    except Exception as e:
                        logger.warning(f"Error cleaning up after timeout for {server_name}: {e}")
                return False
            
        except Exception as e:
            logger.error(f"Failed to connect to {server_name}: {e}")
            # Clean up exit stack if connection failed
            if server_name in self.exit_stacks:
                try:
                    failed_stack = self.exit_stacks[server_name]
                    del self.exit_stacks[server_name]
                    await failed_stack.aclose()
                except Exception as cleanup_err:
                    logger.warning(f"Error cleaning up after failed connection for {server_name}: {cleanup_err}")
            return False
    
    async def connect_to_all_servers(self):
        """Connect to all available MCP servers"""
        servers = await self.list_servers()
        connected = []
        
        for server in servers:
            try:
                success = await self.connect_to_server(server["name"])
                if success:
                    connected.append(server["name"])
            except asyncio.CancelledError:
                logger.warning(f"Connection to {server['name']} was cancelled")
                # Skip this server and continue with others
                continue
            except Exception as e:
                logger.error(f"Unexpected error connecting to {server['name']}: {e}")
                # Skip this server and continue with others
                continue
        
        logger.info(f"Connected to {len(connected)} servers: {', '.join(connected) if connected else 'none'}")
        return connected
    
    async def list_tools(self, server_name):
        """List tools available on a specific MCP server"""
        if server_name not in self.sessions:
            logger.error(f"Server {server_name} not connected")
            return []
        
        try:
            session = self.sessions[server_name]
            response = await session.list_tools()
            
            tools = response.tools
            
            logger.info(f"Tools available on server '{server_name}':")
            for tool in tools:
                logger.info(f"- {tool.name}: {tool.description}")
                logger.info(f"Input schema: {tool.input_schema}")
            
            return tools
            
        except Exception as e:
            logger.error(f"Error listing tools for server {server_name}: {e}")
            return []
    
    async def call_tool(self, server_name, tool_name, args):
        """Call a tool on a connected MCP server"""
        if server_name not in self.sessions:
            logger.error(f"Server {server_name} not connected")
            return {"error": f"Server {server_name} not connected"}
        
        try:
            session = self.sessions[server_name]
            result = await session.call_tool(tool_name, args)
            return result.content
            
        except Exception as e:
            logger.error(f"Error calling tool {tool_name} on server {server_name}: {e}")
            return {"error": str(e)}
    
    async def process_with_ai(self, query):
        """Process a query using Claude and available tools"""
        if not self.anthropic:
            logger.error("Anthropic client not available")
            return "AI processing not available. Set ANTHROPIC_API_KEY in .env file."
        
        logger.info(f"Processing query with AI: {query}")
        
        # Get all available tools from connected servers
        all_tools = []
        for server_name in self.sessions:
            tools = await self.list_tools(server_name)
            for tool in tools:
                all_tools.append({
                    "server": server_name,
                    "name": tool.name,
                    "description": tool.description,
                    "schema": tool.input_schema
                })
        
        if not all_tools:
            logger.warning("No tools available for AI to use")
            
        # Format tools for Claude
        claude_tools = []
        for tool in all_tools:
            claude_tools.append({
                "name": f"{tool['server']}_{tool['name']}",
                "description": tool["description"],
                "input_schema": tool["schema"]
            })
        
        # Create initial message
        messages = [
            {
                "role": "user",
                "content": query
            }
        ]
        
        # Make initial Claude API call
        response = self.anthropic.messages.create(
            model="claude-3-opus-20240229",  # Use appropriate model
            max_tokens=1000,
            messages=messages,
            tools=claude_tools
        )
        
        final_text = []
        for content in response.content:
            if content.type == 'text':
                final_text.append(content.text)
                
            elif content.type == 'tool_use':
                tool_name = content.name
                tool_args = content.input
                
                # Parse server and tool name
                parts = tool_name.split('_', 1)
                if len(parts) < 2:
                    final_text.append(f"Error: Invalid tool name format: {tool_name}")
                    continue
                    
                server_name, actual_tool_name = parts
                
                final_text.append(f"[Calling tool {actual_tool_name} on server {server_name} with args {tool_args}]")
                
                # Execute tool call
                result = await self.call_tool(server_name, actual_tool_name, tool_args)
                final_text.append(f"Tool result: {result}")
                
                # Add tool result to conversation
                messages.append({
                    "role": "assistant",
                    "content": [content]
                })
                messages.append({
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": content.id,
                            "content": result
                        }
                    ]
                })
                
                # Get next response from Claude
                response = self.anthropic.messages.create(
                    model="claude-3-opus-20240229",
                    max_tokens=1000,
                    messages=messages,
                    tools=claude_tools
                )
                
                # Add Claude's response
                final_text.append(response.content[0].text)
                
        # Combine all text into final response
        print("Final response:")
        print("\n".join(final_text))
        return "\n".join(final_text)
        
    async def cleanup(self):
        """Clean up all resources"""
        for server_name, exit_stack in list(self.exit_stacks.items()):
            try:
                # Use a more robust approach to clean up resources
                # Instead of trying to close the exit stack (which can cause task scope errors),
                # we'll first remove our references to it and let Python's garbage collection handle it
                
                # Store a reference to the stack to avoid modifying during iteration
                stack_to_close = exit_stack
                
                # Remove references first
                if server_name in self.sessions:
                    del self.sessions[server_name]
                if server_name in self.exit_stacks:
                    del self.exit_stacks[server_name]
                
                # Now try to close the stack if possible, but don't worry if it fails
                try:
                    # Use a very short timeout to avoid hanging
                    await asyncio.wait_for(stack_to_close.aclose(), 0.5)
                    logger.info(f"Closed connection to {server_name}")
                except asyncio.TimeoutError:
                    logger.warning(f"Timeout closing connection to {server_name}, proceeding anyway")
                except RuntimeError as re:
                    # Handle the specific asyncio cancel scope error
                    if "cancel scope in a different task" in str(re):
                        logger.warning(f"Ignoring expected asyncio task scope error for {server_name}: {re}")
                    else:
                        # Log other runtime errors but continue
                        logger.error(f"Runtime error closing connection to {server_name}: {re}")
                except BaseExceptionGroup as beg:
                    logger.warning(f"Expected exception group during {server_name} cleanup: {beg}")
                except Exception as e:
                    logger.error(f"Error closing connection to {server_name}: {e}")
                
            except Exception as e:
                logger.error(f"Error during cleanup for {server_name}: {e}")
                
        # Clear any remaining references
        self.sessions.clear()
        self.exit_stacks.clear()
        logger.info("All server connections cleaned up")

mcp_client = MCPClient()

# Register shutdown handler to clean up resources when the app exits
import atexit
import asyncio

def shutdown_handler():
    """Clean up MCP resources on application shutdown"""
    logger.info("Application shutting down, cleaning up MCP resources")
    try:
        # Create a new event loop for cleanup
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Run cleanup with a timeout to prevent hanging on shutdown
        try:
            loop.run_until_complete(asyncio.wait_for(mcp_client.cleanup(), 5.0))
        except asyncio.TimeoutError:
            logger.warning("Cleanup timed out after 5 seconds, forcing shutdown")
        except Exception as e:
            logger.error(f"Error during cleanup operation: {e}")
            
        # Additional step to ensure all pending tasks are cancelled
        pending = asyncio.all_tasks(loop)
        if pending:
            logger.info(f"Cancelling {len(pending)} pending tasks")
            for task in pending:
                task.cancel()
            
            # Give tasks a chance to respond to cancellation
            try:
                loop.run_until_complete(asyncio.wait_for(asyncio.gather(*pending, return_exceptions=True), 1.0))
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
                
        # Close the loop properly
        loop.run_until_complete(loop.shutdown_asyncgens())
        loop.close()
    except Exception as e:
        logger.error(f"Error during cleanup at shutdown: {e}")
    
    logger.info("Cleanup complete")

atexit.register(shutdown_handler)

# Global cache for models
models_cache = {}

# Helper function to run async functions in Flask routes
def async_route(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        return asyncio.run(f(*args, **kwargs))
    return wrapped

# ========================
# AI Provider API Endpoints
# ========================

@app.route('/api/providers', methods=['GET'])
def get_providers():
    """Get available AI providers"""
    providers = [
        {"id": "openai", "name": "OpenAI", "available": True},
        {"id": "anthropic", "name": "Anthropic", "available": ANTHROPIC_AVAILABLE},
        {"id": "gemini", "name": "Google Gemini", "available": True},
        {"id": "openroute", "name": "OpenRoute", "available": True},
        {"id": "groq", "name": "Groq", "available": True},
        {"id": "ollama", "name": "Ollama (Local)", "available": True}
    ]
    return jsonify({"providers": providers})

@app.route('/api/models/<provider_id>', methods=['GET'])
def get_models(provider_id):
    """Get available models for a specific provider"""
    api_key = request.args.get('api_key', '')
    
    # Check if models are cached
    cache_key = f"{provider_id}_{api_key[:5]}"  # Use first 5 chars of API key for cache key
    if cache_key in models_cache:
        return jsonify({"models": models_cache[cache_key]})
    
    models = []
    
    # OpenAI models
    if provider_id == 'openai':
        try:
            if not api_key:
                # Return default models if no API key
                models = [
                    {"id": "gpt-4o", "name": "GPT-4o"},
                    {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
                    {"id": "gpt-4", "name": "GPT-4"},
                    {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"}
                ]
            else:
                # Fetch models from OpenAI API
                response = requests.get(
                    'https://api.openai.com/v1/models',
                    headers={'Authorization': f'Bearer {api_key}'}
                )
                if response.status_code == 200:
                    data = response.json()
                    models = [
                        {"id": model["id"], "name": model["id"]} 
                        for model in data["data"] 
                        if "gpt" in model["id"]
                    ]
                else:
                    # Handle error
                    logger.error(f"Error fetching OpenAI models: {response.text}")
                    return jsonify({"error": "Failed to fetch models", "details": response.text}), 400
        except Exception as e:
            logger.error(f"Error fetching OpenAI models: {e}")
            models = [
                {"id": "gpt-4o", "name": "GPT-4o (Default)"},
                {"id": "gpt-4-turbo", "name": "GPT-4 Turbo (Default)"},
                {"id": "gpt-4", "name": "GPT-4 (Default)"},
                {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo (Default)"}
            ]
    
    # Anthropic models
    elif provider_id == 'anthropic':
        try:
            if not api_key:
                # Return default models if no API key
                models = [
                    {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
                    {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet"},
                    {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
                    {"id": "claude-2.1", "name": "Claude 2.1"}
                ]
            else:
                # Verify API key by making a small request
                client = Anthropic(api_key=api_key)
                # Just check if we can initialize without error
                models = [
                    {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
                    {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet"},
                    {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
                    {"id": "claude-2.1", "name": "Claude 2.1"},
                    {"id": "claude-2.0", "name": "Claude 2.0"}
                ]
        except Exception as e:
            logger.error(f"Error fetching Anthropic models: {e}")
            models = [
                {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus (Default)"},
                {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet (Default)"},
                {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku (Default)"},
                {"id": "claude-2.1", "name": "Claude 2.1 (Default)"}
            ]
    
    # Google Gemini models
    elif provider_id == 'gemini':
        try:
            if not api_key:
                # Return default models if no API key
                models = [
                    {"id": "gemini-pro", "name": "Gemini Pro"},
                    {"id": "gemini-ultra", "name": "Gemini Ultra"}
                ]
            else:
                # Fetch models from Gemini API
                response = requests.get(
                    f'https://generativelanguage.googleapis.com/v1beta/models?key={api_key}'
                )
                if response.status_code == 200:
                    data = response.json()
                    models = [
                        {"id": model["name"].split('/')[-1], "name": model.get("displayName", model["name"].split('/')[-1])} 
                        for model in data.get("models", []) 
                        if "gemini" in model["name"]
                    ]
                else:
                    # Handle error
                    logger.error(f"Error fetching Gemini models: {response.text}")
                    return jsonify({"error": "Failed to fetch models", "details": response.text}), 400
        except Exception as e:
            logger.error(f"Error fetching Gemini models: {e}")
            models = [
                {"id": "gemini-pro", "name": "Gemini Pro (Default)"},
                {"id": "gemini-ultra", "name": "Gemini Ultra (Default)"}
            ]
    
    # OpenRoute models
    elif provider_id == 'openroute':
        try:
            if not api_key:
                # Return default models if no API key
                models = [
                    {"id": "openai/gpt-4o", "name": "OpenAI GPT-4o"},
                    {"id": "anthropic/claude-3-opus", "name": "Anthropic Claude 3 Opus"},
                    {"id": "google/gemini-pro", "name": "Google Gemini Pro"},
                    {"id": "meta-llama/llama-3-70b-instruct", "name": "Meta Llama 3 70B"}
                ]
            else:
                # Fetch models from OpenRoute API
                response = requests.get(
                    'https://openrouter.ai/api/v1/models',
                    headers={'Authorization': f'Bearer {api_key}'}
                )
                if response.status_code == 200:
                    data = response.json()
                    models = [
                        {"id": model["id"], "name": model.get("name", model["id"])} 
                        for model in data.get("data", [])
                    ]
                else:
                    # Handle error
                    logger.error(f"Error fetching OpenRoute models: {response.text}")
                    return jsonify({"error": "Failed to fetch models", "details": response.text}), 400
        except Exception as e:
            logger.error(f"Error fetching OpenRoute models: {e}")
            models = [
                {"id": "openai/gpt-4o", "name": "OpenAI GPT-4o (Default)"},
                {"id": "anthropic/claude-3-opus", "name": "Anthropic Claude 3 Opus (Default)"},
                {"id": "google/gemini-pro", "name": "Google Gemini Pro (Default)"},
                {"id": "meta-llama/llama-3-70b-instruct", "name": "Meta Llama 3 70B (Default)"}
            ]
    
    # Groq models
    elif provider_id == 'groq':
        try:
            if not api_key:
                # Return default models if no API key
                models = [
                    {"id": "llama3-70b-8192", "name": "Llama-3 70B"},
                    {"id": "llama3-8b-8192", "name": "Llama-3 8B"},
                    {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B"},
                    {"id": "gemma-7b-it", "name": "Gemma 7B"}
                ]
            else:
                # Fetch models from Groq API
                response = requests.get(
                    'https://api.groq.com/openai/v1/models',
                    headers={'Authorization': f'Bearer {api_key}'}
                )
                if response.status_code == 200:
                    data = response.json()
                    models = [
                        {"id": model["id"], "name": model["id"]} 
                        for model in data.get("data", [])
                    ]
                else:
                    # Handle error
                    logger.error(f"Error fetching Groq models: {response.text}")
                    return jsonify({"error": "Failed to fetch models", "details": response.text}), 400
        except Exception as e:
            logger.error(f"Error fetching Groq models: {e}")
            models = [
                {"id": "llama3-70b-8192", "name": "Llama-3 70B (Default)"},
                {"id": "llama3-8b-8192", "name": "Llama-3 8B (Default)"},
                {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B (Default)"},
                {"id": "gemma-7b-it", "name": "Gemma 7B (Default)"}
            ]
    
    # Ollama models
    elif provider_id == 'ollama':
        try:
            # Fetch models from local Ollama instance
            response = requests.get('http://localhost:11434/api/tags', timeout=3)
            if response.status_code == 200:
                data = response.json()
                models = [
                    {"id": model["name"], "name": model["name"]} 
                    for model in data.get("models", [])
                ]
            else:
                # Handle error
                logger.error(f"Error fetching Ollama models: {response.text}")
                models = [
                    {"id": "llama3", "name": "Llama 3 (Ollama not connected)"},
                    {"id": "mistral", "name": "Mistral (Ollama not connected)"},
                    {"id": "gemma", "name": "Gemma (Ollama not connected)"},
                    {"id": "phi", "name": "Phi (Ollama not connected)"}
                ]
        except Exception as e:
            logger.error(f"Error fetching Ollama models: {e}")
            models = [
                {"id": "llama3", "name": "Llama 3 (Ollama not connected)"},
                {"id": "mistral", "name": "Mistral (Ollama not connected)"},
                {"id": "gemma", "name": "Gemma (Ollama not connected)"},
                {"id": "phi", "name": "Phi (Ollama not connected)"}
            ]
    else:
        return jsonify({"error": "Unknown provider"}), 400
    
    # Cache the result
    models_cache[cache_key] = models
    
    return jsonify({"models": models})

@app.route('/api/send_message', methods=['POST'])
def send_message():
    """Send a message to an AI provider"""
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    provider_id = data.get('provider')
    model_id = data.get('model')
    api_key = data.get('api_key', '')
    message = data.get('message', '')
    
    if not provider_id or not model_id or not message:
        return jsonify({"error": "Missing required parameters"}), 400
    
    try:
        # OpenAI
        if provider_id == 'openai':
            if not api_key:
                return jsonify({"error": "API key required for OpenAI"}), 400
            
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': model_id,
                    'messages': [{'role': 'user', 'content': message}],
                    'temperature': 0.7
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return jsonify({
                    'response': data['choices'][0]['message']['content']
                })
            else:
                return jsonify({"error": "OpenAI API error", "details": response.text}), 400
                
        # Anthropic
        elif provider_id == 'anthropic':
            if not api_key:
                return jsonify({"error": "API key required for Anthropic"}), 400
            
            client = Anthropic(api_key=api_key)
            response = client.messages.create(
                model=model_id,
                max_tokens=1000,
                messages=[
                    {'role': 'user', 'content': message}
                ]
            )
            
            return jsonify({
                'response': response.content[0].text
            })
            
        # Gemini
        elif provider_id == 'gemini':
            if not api_key:
                return jsonify({"error": "API key required for Gemini"}), 400
            
            response = requests.post(
                f'https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={api_key}',
                json={
                    'contents': [{'parts': [{'text': message}]}],
                    'generationConfig': {'temperature': 0.7}
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return jsonify({
                    'response': data['candidates'][0]['content']['parts'][0]['text']
                })
            else:
                return jsonify({"error": "Gemini API error", "details": response.text}), 400
                
        # OpenRoute
        elif provider_id == 'openroute':
            if not api_key:
                return jsonify({"error": "API key required for OpenRoute"}), 400
            
            response = requests.post(
                'https://openrouter.ai/api/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json',
                    'HTTP-Referer': request.headers.get('Origin', ''),
                    'X-Title': 'MCP Client'
                },
                json={
                    'model': model_id,
                    'messages': [{'role': 'user', 'content': message}]
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return jsonify({
                    'response': data['choices'][0]['message']['content']
                })
            else:
                return jsonify({"error": "OpenRoute API error", "details": response.text}), 400
                
        # Groq
        elif provider_id == 'groq':
            if not api_key:
                return jsonify({"error": "API key required for Groq"}), 400
            
            response = requests.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': model_id,
                    'messages': [{'role': 'user', 'content': message}],
                    'temperature': 0.7
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return jsonify({
                    'response': data['choices'][0]['message']['content']
                })
            else:
                return jsonify({"error": "Groq API error", "details": response.text}), 400
                
        # Ollama
        elif provider_id == 'ollama':
            response = requests.post(
                'http://localhost:11434/api/generate',
                json={
                    'model': model_id,
                    'prompt': message,
                    'stream': False
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return jsonify({
                    'response': data['response']
                })
            else:
                return jsonify({"error": "Ollama API error", "details": response.text}), 400
                
        else:
            return jsonify({"error": "Unknown provider"}), 400
            
    except Exception as e:
        logger.error(f"Error sending message to {provider_id}: {str(e)}")
        return jsonify({"error": f"Failed to send message: {str(e)}"}), 500

# ========================
# MCP Server API Endpoints
# ========================

@app.route('/api/mcp/servers', methods=['GET'])
@async_route
async def list_mcp_servers():
    """List available MCP servers"""
    try:
        # Create response object to capture output
        class ResponseCapture:
            def __init__(self):
                self.output = []
            
            def info(self, msg):
                self.output.append(msg)
            
            def error(self, msg):
                self.output.append(f"ERROR: {msg}")

        # Capture the output from list_servers
        response_capture = ResponseCapture()
        
        # Store original logger.info
        original_info = logger.info
        
        # Replace with our capture
        logger.info = response_capture.info
        
        # List servers
        await mcp_client.list_servers()
        
        # Restore original logger
        logger.info = original_info
        
        # Extract server data from output
        servers = []
        current_server = None
        
        for line in response_capture.output:
            if "Available MCP servers:" in line:
                continue
                
            if line.strip().startswith("- "):
                # This is a server line
                parts = line.strip()[2:].split(": ")
                if len(parts) == 2:
                    server_name = parts[0]
                    status = parts[1]
                    current_server = {"name": server_name, "status": status, "tools": []}
                    servers.append(current_server)
            
            elif line.strip().startswith("Tools:"):
                continue
                
            elif current_server and line.strip().startswith("- "):
                # This is a tool line
                tool_info = line.strip()[2:].strip()
                current_server["tools"].append(tool_info)
        
        return jsonify({"servers": servers})
        
    except Exception as e:
        logger.error(f"Error listing MCP servers: {str(e)}")
        return jsonify({"error": f"Failed to list MCP servers: {str(e)}"}), 500

@app.route('/api/mcp/connect', methods=['POST'])
@async_route
async def connect_to_server():
    """Connect to a specific MCP server"""
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    server_name = data.get('server')
    
    if not server_name:
        return jsonify({"error": "Missing server name"}), 400
    
    try:
        success = await mcp_client.connect_to_server(server_name)
        
        if success:
            return jsonify({"success": True, "message": f"Connected to {server_name}"})
        else:
            return jsonify({"success": False, "message": f"Failed to connect to {server_name}"}), 400
    
    except Exception as e:
        logger.error(f"Error connecting to server {server_name}: {str(e)}")
        return jsonify({"error": f"Failed to connect to server: {str(e)}"}), 500

@app.route('/api/mcp/connect-all', methods=['POST'])
@async_route
async def connect_to_all_servers():
    """Connect to all enabled MCP servers"""
    try:
        await mcp_client.connect_to_all_servers()
        return jsonify({"success": True, "message": "Connected to all enabled servers"})
    
    except Exception as e:
        logger.error(f"Error connecting to all servers: {str(e)}")
        return jsonify({"error": f"Failed to connect to all servers: {str(e)}"}), 500

@app.route('/api/mcp/tools/<server_name>', methods=['GET'])
@async_route
async def list_tools(server_name):
    """List tools available on a specific MCP server"""
    try:
        # Connect to server if not already connected
        if server_name not in mcp_client.sessions:
            success = await mcp_client.connect_to_server(server_name)
            if not success:
                return jsonify({"error": f"Failed to connect to server {server_name}"}), 400
        
        # Create response object to capture output
        class ResponseCapture:
            def __init__(self):
                self.output = []
            
            def info(self, msg):
                self.output.append(msg)
        
        # Capture the output from list_tools
        response_capture = ResponseCapture()
        
        # Store original logger.info
        original_info = logger.info
        
        # Replace with our capture
        logger.info = response_capture.info
        
        # List tools
        await mcp_client.list_tools(server_name)
        
        # Restore original logger
        logger.info = original_info
        
        # Extract tool data from output
        tools = []
        
        for line in response_capture.output:
            if f"Tools available on server '{server_name}':" in line:
                continue
                
            if line.strip().startswith("- "):
                # This is a tool line
                tool_line = line.strip()[2:].strip()
                tool_parts = tool_line.split(": ", 1)
                
                if len(tool_parts) == 2:
                    tool_name = tool_parts[0]
                    tool_description = tool_parts[1]
                    
                    tool_info = {
                        "name": tool_name,
                        "description": tool_description,
                        "schema": None
                    }
                    
                    tools.append(tool_info)
            
            elif line.strip().startswith("Input schema:"):
                # This line contains schema information for the previous tool
                if tools:
                    schema_text = line.strip()[13:].strip()
                    try:
                        schema = json.loads(schema_text.replace("...", ""))
                        tools[-1]["schema"] = schema
                    except:
                        tools[-1]["schema"] = schema_text
        
        return jsonify({"tools": tools})
        
    except Exception as e:
        logger.error(f"Error listing tools for server {server_name}: {str(e)}")
        return jsonify({"error": f"Failed to list tools: {str(e)}"}), 500

@app.route('/api/mcp/call_tool', methods=['POST'])
@async_route
async def call_tool():
    """Call a tool on an MCP server"""
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    server_name = data.get('server')
    tool_name = data.get('tool')
    args = data.get('args', {})
    
    if not server_name or not tool_name:
        return jsonify({"error": "Missing required parameters"}), 400
    
    try:
        # Connect to server if not already connected
        if server_name not in mcp_client.sessions:
            success = await mcp_client.connect_to_server(server_name)
            if not success:
                return jsonify({"error": f"Failed to connect to server {server_name}"}), 400
        
        # Create response object to capture output
        class ResponseCapture:
            def __init__(self):
                self.output = []
                self.result = None
            
            def info(self, msg):
                self.output.append(msg)
        
        # Capture the output
        response_capture = ResponseCapture()
        
        # Store original print and logger.info
        original_print = print
        original_info = logger.info
        
        # Replace with our capture
        def capture_print(*args, **kwargs):
            text = " ".join(str(arg) for arg in args)
            response_capture.result = text
            original_print(*args, **kwargs)
        
        print = capture_print
        logger.info = response_capture.info
        
        # Call tool
        await mcp_client.call_tool(server_name, tool_name, args)
        
        # Restore original print and logger.info
        print = original_print
        logger.info = original_info
        
        # Extract result
        result = response_capture.result
        
        return jsonify({
            "success": True,
            "result": result,
            "logs": response_capture.output
        })
        
    except Exception as e:
        logger.error(f"Error calling tool {tool_name} on server {server_name}: {str(e)}")
        return jsonify({"error": f"Failed to call tool: {str(e)}"}), 500

@app.route('/api/mcp/ai_process', methods=['POST'])
@async_route
async def process_with_ai():
    """Process a query using Claude and available MCP tools"""
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    query = data.get('query')
    
    if not query:
        return jsonify({"error": "Missing query parameter"}), 400
    
    try:
        # Connect to all servers first
        await mcp_client.connect_to_all_servers()
        
        # Create response object to capture output
        class ResponseCapture:
            def __init__(self):
                self.output = []
                self.final_response = ""
            
            def info(self, msg):
                self.output.append({"type": "info", "content": msg})
            
            def tool_call(self, tool, args):
                self.output.append({"type": "tool_call", "tool": tool, "args": args})
            
            def tool_result(self, result):
                self.output.append({"type": "tool_result", "content": result})
            
            def response(self, text):
                self.output.append({"type": "response", "content": text})
                self.final_response += text
        
        # Capture the output
        response_capture = ResponseCapture()
        
        # Store original print and logger.info
        original_print = print
        original_info = logger.info
        
        # Replace with our capture
        def capture_print(*args, **kwargs):
            text = " ".join(str(arg) for arg in args)
            if "[Calling tool" in text:
                # Extract tool call information
                parts = text.split("with args", 1)
                if len(parts) == 2:
                    tool = parts[0].replace("[Calling tool", "").strip()
                    args_text = parts[1].replace("]", "").strip()
                    try:
                        args = json.loads(args_text)
                    except:
                        args = args_text
                    response_capture.tool_call(tool, args)
            elif "Tool result:" in text:
                response_capture.tool_result(text.replace("Tool result:", "").strip())
            elif "Final response:" in text:
                # Don't capture this header
                pass
            else:
                response_capture.response(text)
            
            original_print(*args, **kwargs)
        
        print = capture_print
        logger.info = response_capture.info
        
        # Process with AI
        if mcp_client.anthropic:
            await mcp_client.process_with_ai(query)
        else:
            return jsonify({"error": "AI processing not available. Set ANTHROPIC_API_KEY in .env file"}), 400
        
        # Restore original print and logger.info
        print = original_print
        logger.info = original_info
        
        return jsonify({
            "success": True,
            "response": response_capture.final_response,
            "steps": response_capture.output
        })
        
    except Exception as e:
        logger.error(f"Error processing with AI: {str(e)}")
        return jsonify({"error": f"Failed to process with AI: {str(e)}"}), 500

# Run the application
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
