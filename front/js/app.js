/**
 * MCP Client - Main Application
 * Handles UI interactions and coordinates between modules
 * Improved integration with MCP tools
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize application
    const app = new MCPClientApp();
    app.init();
});

class MCPClientApp {
    constructor() {
        // Chat state
        this.chatHistory = [];
        this.currentProvider = 'openai';
        this.currentModel = '';
        this.isDarkMode = false;
        this.apiKeysTested = {}; // Track which API keys have been tested
        this.isProcessing = false; // Flag to prevent multiple simultaneous requests
        
        // DOM elements
        this.elements = {
            providerSelect: null,
            modelSelect: null,
            apiKeyInput: null,
            saveKeyButton: null,
            testKeyButton: null,
            themeToggle: null,
            chatContainer: null,
            userInput: null,
            sendButton: null,
            clearChatButton: null,
            configFileInput: null,
            toolsList: null,
            toolsPanel: null,
            closeToolsPanelButton: null,
            activeTools: null,
            connectAllButton: null,
            exampleQueriesContainer: null,
            processingIndicator: null
        };
    }
    
    // Initialize the application
    async init() {
        // Get DOM elements
        this.getElements();
        
        // Initialize MCP tools
        if (window.mcpTools) {
            mcpTools.init(
                this.elements.toolsList,
                this.elements.toolsPanel
            );
        }
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load saved theme preference
        this.loadThemePreference();
        
        // Check if backend is available
        await this.checkBackendAvailability();
        
        // Populate provider select
        await this.populateProviders();
        
        // Connect to MCP servers
        this.connectToMcpServers();
        
        // Load saved chat history
        this.loadChatHistory();
        
        // Populate example queries if container exists
        if (this.elements.exampleQueriesContainer) {
            this.populateExampleQueries();
        }
    }
    
    // Get DOM elements
    getElements() {
        this.elements.providerSelect = document.getElementById('provider-select');
        this.elements.modelSelect = document.getElementById('model-select');
        this.elements.apiKeyInput = document.getElementById('api-key');
        this.elements.saveKeyButton = document.getElementById('save-key');
        this.elements.testKeyButton = document.getElementById('test-key');
        this.elements.themeToggle = document.getElementById('theme-toggle');
        this.elements.chatContainer = document.getElementById('chat-container');
        this.elements.userInput = document.getElementById('user-input');
        this.elements.sendButton = document.getElementById('send-message');
        this.elements.clearChatButton = document.getElementById('clear-chat');
        this.elements.configFileInput = document.getElementById('config-file');
        this.elements.toolsList = document.getElementById('tools-list');
        this.elements.toolsPanel = document.getElementById('tools-panel');
        this.elements.closeToolsPanelButton = document.getElementById('close-tools-panel');
        this.elements.activeTools = document.getElementById('active-tools');
        this.elements.connectAllButton = document.getElementById('connect-all-mcp');
        this.elements.exampleQueriesContainer = document.getElementById('example-queries');
        this.elements.processingIndicator = document.getElementById('processing-indicator');
    }
    
    // Set up event listeners
    setupEventListeners() {
        // Provider and model selection
        if (this.elements.providerSelect) {
            this.elements.providerSelect.addEventListener('change', () => this.handleProviderChange());
        }
        
        // API key management
        if (this.elements.saveKeyButton) {
            this.elements.saveKeyButton.addEventListener('click', () => this.saveApiKey());
        }
        
        // Test API key
        if (this.elements.testKeyButton) {
            this.elements.testKeyButton.addEventListener('click', () => this.testApiKey());
        }
        
        // Theme toggle
        if (this.elements.themeToggle) {
            this.elements.themeToggle.addEventListener('change', () => this.toggleTheme());
        }
        
        // Chat interactions
        if (this.elements.sendButton) {
            this.elements.sendButton.addEventListener('click', () => this.sendMessage());
        }
        
        if (this.elements.userInput) {
            this.elements.userInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
        
        if (this.elements.clearChatButton) {
            this.elements.clearChatButton.addEventListener('click', () => this.clearChat());
        }
        
        // MCP config file upload
        if (this.elements.configFileInput) {
            this.elements.configFileInput.addEventListener('change', (e) => this.handleConfigFile(e));
        }
        
        // Tools panel
        if (this.elements.closeToolsPanelButton) {
            this.elements.closeToolsPanelButton.addEventListener('click', () => {
                if (window.mcpTools) {
                    mcpTools.closeToolsPanel();
                }
            });
        }
        
        // Connect to all MCP servers
        if (this.elements.connectAllButton) {
            this.elements.connectAllButton.addEventListener('click', () => this.connectToMcpServers());
        }
        
        // Window resize event to adjust layout
        window.addEventListener('resize', () => this.adjustLayout());
        
        // Adjust layout initially
        this.adjustLayout();
    }
    
    // Check if backend is available
    async checkBackendAvailability() {
        try {
            if (window.mcpApi) {
                const available = await mcpApi.checkBackendAvailability();
                if (!available) {
                    this.showNotification('Backend server is not available. Please start the server.', 'error', 10000);
                }
                return available;
            } else {
                this.showNotification('API client not available. Some features will be disabled.', 'warning', 5000);
                return false;
            }
        } catch (error) {
            this.showNotification('Failed to connect to backend server.', 'error', 5000);
            return false;
        }
    }
    
    // Load saved theme preference
    loadThemePreference() {
        if (!this.elements.themeToggle) return;
        
        const darkMode = localStorage.getItem('mcp_client_dark_mode') === 'true';
        this.isDarkMode = darkMode;
        this.elements.themeToggle.checked = darkMode;
        
        if (darkMode) {
            document.body.classList.add('dark-mode');
        }
    }
    
    // Toggle between light and dark theme
    toggleTheme() {
        if (!this.elements.themeToggle) return;
        
        this.isDarkMode = this.elements.themeToggle.checked;
        
        if (this.isDarkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        
        localStorage.setItem('mcp_client_dark_mode', this.isDarkMode);
    }
    
    // Adjust layout based on screen size
    adjustLayout() {
        const isMobile = window.innerWidth < 768;
        
        // Adjust chat container height for mobile
        if (this.elements.chatContainer) {
            if (isMobile) {
                this.elements.chatContainer.style.height = 'calc(100vh - 280px)';
            } else {
                this.elements.chatContainer.style.height = 'calc(100vh - 180px)';
            }
        }
        
        // Adjust tools panel for mobile
        if (this.elements.toolsPanel) {
            if (isMobile) {
                this.elements.toolsPanel.classList.add('mobile');
            } else {
                this.elements.toolsPanel.classList.remove('mobile');
            }
        }
    }
    
    // Populate provider select dropdown
    async populateProviders() {
        if (!this.elements.providerSelect) return;
        
        try {
            let providers = [];
            
            // Try to get providers from API
            if (window.mcpApi) {
                providers = await mcpApi.getProviders();
            } else {
                // Fallback to hardcoded providers
                providers = [
                    { id: 'openai', name: 'OpenAI', available: true },
                    { id: 'anthropic', name: 'Anthropic', available: true },
                    { id: 'gemini', name: 'Google Gemini', available: true },
                    { id: 'openroute', name: 'OpenRoute', available: true },
                    { id: 'groq', name: 'Groq', available: true },
                    { id: 'ollama', name: 'Ollama (Local)', available: true }
                ];
            }
            
            // Clear existing options
            this.elements.providerSelect.innerHTML = '';
            
            // Add providers to select
            providers.forEach(provider => {
                if (provider.available) {
                    const option = document.createElement('option');
                    option.value = provider.id;
                    option.textContent = provider.name;
                    this.elements.providerSelect.appendChild(option);
                }
            });
            
            // Set current provider from localStorage or default to first provider
            const savedProvider = localStorage.getItem('mcp_client_provider');
            if (savedProvider && providers.some(p => p.id === savedProvider)) {
                this.currentProvider = savedProvider;
            } else if (providers.length > 0) {
                this.currentProvider = providers[0].id;
            }
            
            // Set selected option
            this.elements.providerSelect.value = this.currentProvider;
            
            // Load models for selected provider
            await this.loadModels();
            
            // Load API key for selected provider
            this.loadApiKey();
        } catch (error) {
            console.error('Error populating providers:', error);
            this.showNotification('Failed to load AI providers.', 'error');
        }
    }
    
    // Handle provider change
    async handleProviderChange() {
        if (!this.elements.providerSelect) return;
        
        this.currentProvider = this.elements.providerSelect.value;
        localStorage.setItem('mcp_client_provider', this.currentProvider);
        
        // Load models for the new provider
        await this.loadModels();
        
        // Load API key for the new provider
        this.loadApiKey();
    }
    
    // Load models for the selected provider
    async loadModels() {
        if (!this.elements.modelSelect) return;
        
        // Clear current options
        this.elements.modelSelect.innerHTML = '';
        
        try {
            // Show loading state
            const loadingOption = document.createElement('option');
            loadingOption.textContent = 'Loading models...';
            this.elements.modelSelect.appendChild(loadingOption);
            
            let models = [];
            
            // Try to get models from API
            if (window.mcpApi) {
                models = await mcpApi.getModels(this.currentProvider);
            } else {
                // Fallback to hardcoded models based on provider
                switch (this.currentProvider) {
                    case 'openai':
                        models = [
                            { id: 'gpt-4o', name: 'GPT-4o' },
                            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
                            { id: 'gpt-4', name: 'GPT-4' },
                            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
                        ];
                        break;
                    case 'anthropic':
                        models = [
                            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
                            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
                            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
                            { id: 'claude-2.1', name: 'Claude 2.1' }
                        ];
                        break;
                    case 'gemini':
                        models = [
                            { id: 'gemini-pro', name: 'Gemini Pro' },
                            { id: 'gemini-ultra', name: 'Gemini Ultra' }
                        ];
                        break;
                    case 'openroute':
                        models = [
                            { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o' },
                            { id: 'anthropic/claude-3-opus', name: 'Anthropic Claude 3 Opus' },
                            { id: 'google/gemini-pro', name: 'Google Gemini Pro' },
                            { id: 'meta-llama/llama-3-70b-instruct', name: 'Meta Llama 3 70B' }
                        ];
                        break;
                    case 'groq':
                        models = [
                            { id: 'llama3-70b-8192', name: 'Llama-3 70B' },
                            { id: 'llama3-8b-8192', name: 'Llama-3 8B' },
                            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
                            { id: 'gemma-7b-it', name: 'Gemma 7B' }
                        ];
                        break;
                    case 'ollama':
                        models = [
                            { id: 'llama3', name: 'Llama 3' },
                            { id: 'mistral', name: 'Mistral' },
                            { id: 'gemma', name: 'Gemma' },
                            { id: 'phi', name: 'Phi' }
                        ];
                        break;
                }
            }
            
            // Clear loading state
            this.elements.modelSelect.innerHTML = '';
            
            // Add models to select
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                this.elements.modelSelect.appendChild(option);
            });
            
            // Set current model from localStorage or default to first model
            const savedModel = localStorage.getItem(`mcp_client_model_${this.currentProvider}`);
            if (savedModel && models.some(m => m.id === savedModel)) {
                this.currentModel = savedModel;
            } else if (models.length > 0) {
                this.currentModel = models[0].id;
            } else {
                this.currentModel = '';
            }
            
            // Set selected option
            this.elements.modelSelect.value = this.currentModel;
            
            // Save selected model when changed
            this.elements.modelSelect.addEventListener('change', () => {
                this.currentModel = this.elements.modelSelect.value;
                localStorage.setItem(`mcp_client_model_${this.currentProvider}`, this.currentModel);
            });
        } catch (error) {
            console.error('Error loading models:', error);
            
            // Show error state
            this.elements.modelSelect.innerHTML = '';
            const errorOption = document.createElement('option');
            errorOption.textContent = 'Error loading models';
            this.elements.modelSelect.appendChild(errorOption);
            
            this.showNotification('Failed to load models.', 'error');
        }
    }
    
    // Load API key for the selected provider
    loadApiKey() {
        if (!this.elements.apiKeyInput) return;
        
        let apiKey = '';
        
        // Try to get API key from mcpApi
        if (window.mcpApi) {
            apiKey = mcpApi.getApiKey(this.currentProvider);
        } else {
            // Fallback to localStorage
            const keys = JSON.parse(localStorage.getItem('mcp_client_api_keys') || '{}');
            apiKey = keys[this.currentProvider] || '';
        }
        
        this.elements.apiKeyInput.value = apiKey;
        
        // Disable API key input for Ollama (local)
        if (this.currentProvider === 'ollama') {
            this.elements.apiKeyInput.disabled = true;
            this.elements.apiKeyInput.placeholder = 'No API key needed for local Ollama';
            this.elements.saveKeyButton.disabled = true;
            if (this.elements.testKeyButton) {
                this.elements.testKeyButton.disabled = true;
            }
        } else {
            this.elements.apiKeyInput.disabled = false;
            this.elements.apiKeyInput.placeholder = 'Enter API Key';
            this.elements.saveKeyButton.disabled = false;
            if (this.elements.testKeyButton) {
                this.elements.testKeyButton.disabled = false;
            }
        }
    }
    
    // Save API key for the selected provider
    saveApiKey() {
        if (!this.elements.apiKeyInput) return;
        
        const apiKey = this.elements.apiKeyInput.value.trim();
        
        if (window.mcpApi) {
            mcpApi.saveApiKey(this.currentProvider, apiKey);
        } else {
            // Fallback to localStorage
            const keys = JSON.parse(localStorage.getItem('mcp_client_api_keys') || '{}');
            keys[this.currentProvider] = apiKey;
            localStorage.setItem('mcp_client_api_keys', JSON.stringify(keys));
        }
        
        this.showNotification('API key saved successfully!', 'success');
        
        // Reset API key tested state
        this.apiKeysTested[this.currentProvider] = false;
        
        // Clear models cache for this provider
        if (window.mcpApi) {
            mcpApi.clearModelsCache(this.currentProvider);
        }
        
        // Reload models with the new API key
        this.loadModels();
    }
    
    // Test API key for the selected provider
    async testApiKey() {
        if (!this.elements.apiKeyInput || !this.elements.testKeyButton) return;
        
        const apiKey = this.elements.apiKeyInput.value.trim();
        
        if (!apiKey && this.currentProvider !== 'ollama') {
            this.showNotification('Please enter an API key to test.', 'error');
            return;
        }
        
        // Show loading state
        this.elements.testKeyButton.disabled = true;
        this.elements.testKeyButton.innerHTML = '<span class="loading-spinner"></span> Testing...';
        
        try {
            let result;
            
            if (window.mcpApi) {
                result = await mcpApi.testApiKey(this.currentProvider, apiKey);
            } else {
                // Simulate API key test
                await new Promise(resolve => setTimeout(resolve, 1000));
                result = {
                    success: true,
                    message: `Simulated successful test for ${this.currentProvider}`
                };
            }
            
            if (result.success) {
                this.showNotification(result.message, 'success');
                this.apiKeysTested[this.currentProvider] = true;
                
                // Update models if returned in test result
                if (result.models && result.models.length > 0) {
                    // Clear the select
                    this.elements.modelSelect.innerHTML = '';
                    
                    // Add models to select
                    result.models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.id;
                        option.textContent = model.name;
                        this.elements.modelSelect.appendChild(option);
                    });
                    
                    // Set first model as current
                    this.currentModel = result.models[0].id;
                    this.elements.modelSelect.value = this.currentModel;
                    localStorage.setItem(`mcp_client_model_${this.currentProvider}`, this.currentModel);
                }
            } else {
                this.showNotification(result.message, 'error');
                this.apiKeysTested[this.currentProvider] = false;
            }
        } catch (error) {
            this.showNotification(`Error testing API key: ${error.message}`, 'error');
            this.apiKeysTested[this.currentProvider] = false;
        } finally {
            // Restore button state
            this.elements.testKeyButton.disabled = false;
            this.elements.testKeyButton.innerHTML = 'Test Key';
        }
    }
    
    // Connect to MCP servers
    async connectToMcpServers() {
        if (!window.mcpApi) {
            this.showNotification('API client not available. Cannot connect to MCP servers.', 'warning');
            return;
        }
        
        try {
            // Show notification
            this.showNotification('Connecting to MCP servers...', 'info');
            
            // Connect to all enabled MCP servers
            const result = await mcpApi.connectToAllMcpServers();
            
            if (result.success) {
                this.showNotification(result.message, 'success');
                
                // Update the connectedServers set in mcpTools with connected servers
                if (window.mcpTools && result.servers && Array.isArray(result.servers)) {
                    result.servers.forEach(serverName => {
                        mcpTools.connectedServers.add(serverName);
                    });
                }
                
                // Refresh MCP servers list in the UI if available
                if (window.mcpTools) {
                    mcpTools.renderToolsList();
                }
            } else {
                this.showNotification(result.message, 'warning');
            }
        } catch (error) {
            console.error('Error connecting to MCP servers:', error);
            this.showNotification(`Error connecting to MCP servers: ${error.message}`, 'error');
        }
    }
    
    // Handle MCP config file upload
    async handleConfigFile(event) {
        if (!event.target.files.length || !window.mcpTools) return;
        
        const file = event.target.files[0];
        if (!file) return;
        
        const success = await mcpTools.loadConfigFromFile(file);
        
        if (success) {
            this.showNotification('MCP configuration loaded successfully!', 'success');
            
            // Connect to the newly loaded MCP servers
            this.connectToMcpServers();
        }
        
        // Reset file input
        event.target.value = '';
    }
    
    // Send a message to the AI provider
    async sendMessage() {
        if (!this.elements.userInput || !this.elements.sendButton) return;
        
        // Prevent multiple simultaneous requests
        if (this.isProcessing) {
            this.showNotification('Please wait for the current message to finish processing.', 'warning');
            return;
        }
        
        const message = this.elements.userInput.value.trim();
        
        if (!message) return;
        
        // Check if provider and model are selected
        if (!this.currentProvider || !this.currentModel) {
            this.showNotification('Please select a provider and model first.', 'error');
            return;
        }
        
        // Check if API key is provided (except for Ollama)
        if (this.currentProvider !== 'ollama') {
            let apiKey = '';
            
            if (window.mcpApi) {
                apiKey = mcpApi.getApiKey(this.currentProvider);
            } else {
                // Fallback to localStorage
                const keys = JSON.parse(localStorage.getItem('mcp_client_api_keys') || '{}');
                apiKey = keys[this.currentProvider] || '';
            }
            
            if (!apiKey) {
                this.showNotification('Please enter an API key for the selected provider.', 'error');
                return;
            }
        }
        
        // Set processing flag
        this.isProcessing = true;
        
        // Disable send button
        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = true;
        }
        
        // Show processing indicator
        if (this.elements.processingIndicator) {
            this.elements.processingIndicator.style.display = 'block';
        }
        
        // Clear input
        this.elements.userInput.value = '';
        
        // Add user message to chat
        this.addMessageToChat('user', message);
        
        try {
            // Always use AI processing with MCP tools if available
            if (window.mcpApi) {
                // Connect to all MCP servers first to ensure they're available
                await mcpApi.connectToAllMcpServers();
                
                // Use AI processing with MCP tools
                const result = await mcpApi.processWithAI(message);
                
                // Process the response and extract tool usage
                const { processedResponse, usedTools } = this.processAiWithToolsResponse(result);
                
                // Add the final AI response with tool indicators
                this.addMessageToChat('ai', processedResponse, usedTools);
            } else {
                // Regular AI chat (fallback if MCP API not available)
                let responseText;
                
                if (window.mcpApi) {
                    // Use API
                    const result = await mcpApi.sendMessage(this.currentProvider, this.currentModel, message);
                    responseText = result.response;
                } else {
                    // Simulate response for testing
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    responseText = `This is a simulated response to: "${message}"\n\nIn a real implementation, this would be a response from the ${this.currentProvider} API using the ${this.currentModel} model.`;
                }
                
                // Add AI response to chat
                this.addMessageToChat('ai', responseText);
            }
            
            // Save chat history
            this.saveChatHistory();
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Add error message to chat
            this.addMessageToChat('ai', `Error: ${error.message}`);
            
            // Save chat history
            this.saveChatHistory();
            
            // Show notification
            this.showNotification(`Error: ${error.message}`, 'error');
        } finally {
            // Reset processing flag
            this.isProcessing = false;
            
            // Enable send button
            if (this.elements.sendButton) {
                this.elements.sendButton.disabled = false;
            }
            
            // Hide processing indicator
            if (this.elements.processingIndicator) {
                this.elements.processingIndicator.style.display = 'none';
            }
        }
    }
    
    // Process AI with tools response
    processAiWithToolsResponse(result) {
        if (!result || !result.steps) {
            return {
                processedResponse: result.response || 'No response received',
                usedTools: []
            };
        }
        
        // Build a formatted response with tool calls and results
        let formattedResponse = '';
        const usedTools = [];
        
        for (const step of result.steps) {
            if (step.type === 'response') {
                formattedResponse += step.content;
            } else if (step.type === 'tool_call') {
                // Add tool to usedTools array if not already present
                if (!usedTools.some(tool => tool.name === step.tool)) {
                    // Extract server name and tool name
                    let serverName = '';
                    let toolName = step.tool;
                    
                    // If tool name contains server prefix (e.g. "doc-qa-server_query_docs")
                    if (step.tool.includes('_')) {
                        const parts = step.tool.split('_');
                        serverName = parts[0];
                        toolName = parts.slice(1).join('_');
                    }
                    
                    usedTools.push({
                        name: toolName,
                        server: serverName,
                        args: step.args
                    });
                }
                
                // Add tool call to formatted response
                formattedResponse += `\n\n[使用工具: ${step.tool}]\n`;
            } else if (step.type === 'tool_result') {
                formattedResponse += `\n结果: ${step.content}\n\n`;
            }
        }
        
        return {
            processedResponse: formattedResponse || result.response || 'No response received',
            usedTools
        };
    }
    
    // Check if message contains references to MCP tools
    async checkForMcpToolReferences(message) {
        console.log("Checking for MCP tool references in:", message);
        
        // If MCP tools not available, return false
        if (!window.mcpTools || !mcpTools.config || !mcpTools.config.mcpServers) {
            console.log("MCP tools not available");
            return false;
        }
        
        // First try to connect to all servers
        if (window.mcpApi) {
            try {
                await mcpApi.connectToAllMcpServers();
            } catch (error) {
                console.error("Error connecting to MCP servers:", error);
            }
        }
        
        // Get available tool names and their servers
        const toolsAndServers = [];
        for (const [serverName, server] of Object.entries(mcpTools.config.mcpServers)) {
            if (server.disabled) {
                console.log(`Server ${serverName} is disabled, skipping`);
                continue;
            }
            
            // Add the server name itself as a tool reference
            toolsAndServers.push({ name: serverName, server: serverName, isServer: true });
            
            if (server.tools) {
                server.tools.forEach(tool => {
                    const toolName = typeof tool === 'string' ? tool : tool.name;
                    toolsAndServers.push({ name: toolName, server: serverName, isServer: false });
                });
            }
        }
        
        console.log("Available tools and servers:", toolsAndServers);
        
        try {
            // Use AI to determine if message needs any tools
            if (window.mcpApi) {
                const result = await mcpApi.processWithAI(message);
                // If the result contains any tool calls, return true
                const hasToolCalls = result.steps && result.steps.some(step => step.type === 'tool_call');
                console.log("AI tool detection result:", hasToolCalls);
                return hasToolCalls;
            }
        } catch (error) {
            console.error("Error checking for tool references:", error);
            // If AI processing fails, fall back to basic tool name matching
            const messageLower = message.toLowerCase();
            return toolsAndServers.some(tool => messageLower.includes(tool.name.toLowerCase()));
        }
        
        return false;
    }
    
    // Add a message to the chat
    addMessageToChat(role, content, usedTools = []) {
        if (!this.elements.chatContainer) return;
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}-message`;
        
        // Format content (simple markdown-like formatting)
        const formattedContent = this.formatMessage(content);
        
        // Create tools badge HTML if tools were used
        let toolsBadgeHtml = '';
        if (role === 'ai' && usedTools && usedTools.length > 0) {
            const toolNames = usedTools.map(tool => tool.name).join(', ');
            toolsBadgeHtml = `
                <div class="tools-badge">
                    <i class="fas fa-tools"></i> 使用工具: ${toolNames}
                </div>
            `;
        }
        
        // Add content
        messageElement.innerHTML = `
            ${toolsBadgeHtml}
            <div class="message-content markdown">${formattedContent}</div>
            <div class="message-time">${this.formatTime(new Date())}</div>
            <div class="message-actions">
                ${role === 'ai' ? '<button class="copy-button" title="Copy to clipboard"><i class="fas fa-copy"></i></button>' : ''}
                ${role === 'ai' ? '<button class="tools-button" title="Use tools mentioned in message"><i class="fas fa-tools"></i></button>' : ''}
            </div>
        `;
        
        // Add event listeners for message actions
        const copyButton = messageElement.querySelector('.copy-button');
        if (copyButton) {
            copyButton.addEventListener('click', () => this.copyMessageToClipboard(content));
        }
        
        const toolsButton = messageElement.querySelector('.tools-button');
        if (toolsButton) {
            toolsButton.addEventListener('click', () => this.activateToolsFromMessage(content));
        }
        
        // If tools were used, add click event to the tools badge to activate those tools
        const toolsBadge = messageElement.querySelector('.tools-badge');
        if (toolsBadge && usedTools.length > 0) {
            toolsBadge.style.cursor = 'pointer';
            toolsBadge.addEventListener('click', async () => {
                // Connect to all servers first
                if (window.mcpApi) {
                    await mcpApi.connectToAllMcpServers();
                }
                
                // Activate each tool
                for (const tool of usedTools) {
                    if (window.mcpTools) {
                        await mcpTools.activateTool(tool.server, tool.name);
                    }
                }
                
                // Show notification
                this.showNotification(`已激活 ${usedTools.length} 个工具`);
            });
        }
        
        // Remove welcome message if present
        const welcomeMessage = this.elements.chatContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        // Add to chat container
        this.elements.chatContainer.appendChild(messageElement);
        
        // Scroll to bottom
        this.elements.chatContainer.scrollTop = this.elements.chatContainer.scrollHeight;
        
        // Add to chat history
        this.chatHistory.push({
            role,
            content,
            usedTools: usedTools || [],
            timestamp: new Date().toISOString()
        });
    }
    
    // Format message with markdown-like syntax
    formatMessage(message) {
        // This is a simple implementation - a real one would use a proper markdown parser
        let formatted = message;
        
        // Escape HTML
        formatted = formatted
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        // Code blocks
        formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // Inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Headers
        formatted = formatted.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        formatted = formatted.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        formatted = formatted.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        
        // Lists
        formatted = formatted.replace(/^\s*\- (.*$)/gm, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Line breaks
        formatted = formatted.replace(/\n/g, '<br>');
        
        // Highlight MCP tools
        if (window.mcpTools && mcpTools.config && mcpTools.config.mcpServers) {
            // Get all tool names
            const toolNames = [];
            
            for (const [serverName, server] of Object.entries(mcpTools.config.mcpServers)) {
                if (server.tools) {
                    server.tools.forEach(tool => {
                        const toolName = typeof tool === 'string' ? tool : tool.name;
                        toolNames.push(toolName);
                    });
                }
            }
            
            // Sort by length (longest first) to avoid partial matches
            toolNames.sort((a, b) => b.length - a.length);
            
            // Highlight tool names
            for (const toolName of toolNames) {
                const regex = new RegExp(`\\b${this.escapeRegExp(toolName)}\\b`, 'gi');
                formatted = formatted.replace(regex, `<span class="tool-highlight">${toolName}</span>`);
            }
        }
        
        return formatted;
    }
    
    // Escape special characters for RegExp
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    // Format time for message timestamp
    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Copy message content to clipboard
    copyMessageToClipboard(content) {
        navigator.clipboard.writeText(content)
            .then(() => {
                this.showNotification('Copied to clipboard!', 'success');
            })
            .catch(err => {
                console.error('Error copying to clipboard:', err);
                this.showNotification('Failed to copy to clipboard', 'error');
            });
    }
    
    // Activate MCP tools based on message content
    async activateToolsFromMessage(message) {
        console.log("Activating tools for message:", message);
        
        // Check if MCP tools are available
        if (!window.mcpTools || !mcpTools.config || !mcpTools.config.mcpServers) {
            console.log("MCP tools not available");
            return;
        }
        
        try {
            // Use AI to process message and determine which tools to activate
            if (window.mcpApi) {
                const result = await mcpApi.processWithAI(message);
                if (result.steps) {
                    const toolCalls = result.steps.filter(step => step.type === 'tool_call');
                    console.log("Found tool calls:", toolCalls);
                    
                    if (toolCalls.length > 0) {
                        // Try to connect to all servers first
                        await mcpApi.connectToAllMcpServers();
                        
                        // Activate each tool
                        for (const toolCall of toolCalls) {
                            const toolName = toolCall.tool;
                            // Find the server for this tool
                            for (const [serverName, server] of Object.entries(mcpTools.config.mcpServers)) {
                                if (server.disabled) continue;
                                
                                if (server.tools && server.tools.some(t => 
                                    (typeof t === 'string' ? t : t.name) === toolName)) {
                                    // Connect to server if not already connected
                                    if (!mcpTools.isServerConnected(serverName)) {
                                        await mcpTools.connectToServer(serverName);
                                    }
                                    // Activate the tool
                                    mcpTools.activateTool(toolName);
                                    break;
                                }
                            }
                        }
                        
                        // Show notification
                        this.showNotification(`已激活 ${toolCalls.length} 个工具`);
                    } else {
                        console.log("No tool calls found in AI response");
                    }
                }
            }
        } catch (error) {
            console.error("Error activating tools:", error);
            this.showNotification("激活工具时出错");
        }
    }
    
    // Clear the chat
    clearChat() {
        if (!this.elements.chatContainer) return;
        
        if (confirm('Are you sure you want to clear the chat history?')) {
            // Clear chat container
            this.elements.chatContainer.innerHTML = `
                <div class="welcome-message">
                    <h2>Welcome to MCP Client</h2>
                    <p>Select an AI provider and model to start chatting</p>
                    <p>Load your MCP config to enable additional tools</p>
                </div>
            `;
            
            // Clear chat history
            this.chatHistory = [];
            
            // Save empty chat history
            this.saveChatHistory();
        }
    }
    
    // Save chat history to localStorage
    saveChatHistory() {
        localStorage.setItem('mcp_client_chat_history', JSON.stringify(this.chatHistory));
    }
    
    // Load chat history from localStorage
    loadChatHistory() {
        if (!this.elements.chatContainer) return;
        
        try {
            const savedHistory = localStorage.getItem('mcp_client_chat_history');
            
            if (savedHistory) {
                this.chatHistory = JSON.parse(savedHistory);
                
                // Add messages to chat
                if (this.chatHistory.length > 0) {
                    // Remove welcome message
                    const welcomeMessage = this.elements.chatContainer.querySelector('.welcome-message');
                    if (welcomeMessage) {
                        welcomeMessage.remove();
                    }
                    
                    // Add messages
                    this.chatHistory.forEach(message => {
                        this.addMessageToChat(message.role, message.content);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }
    
    // Populate example queries
    populateExampleQueries() {
        if (!this.elements.exampleQueriesContainer) return;
        
        let exampleQueries = [];
        
        if (window.mcpApi) {
            exampleQueries = mcpApi.getExampleQueries();
        } else {
            exampleQueries = [
                "What files are in the current directory?",
                "Search for information about Model Context Protocol",
                "Generate a simple chart showing the top 5 countries by population",
                "Check if there are any git changes in this repository"
            ];
        }
        
        this.elements.exampleQueriesContainer.innerHTML = '';
        
        exampleQueries.forEach(query => {
            const button = document.createElement('button');
            button.className = 'example-query-btn';
            button.textContent = query;
            button.addEventListener('click', () => {
                if (this.elements.userInput) {
                    this.elements.userInput.value = query;
                    this.elements.userInput.focus();
                }
            });
            
            this.elements.exampleQueriesContainer.appendChild(button);
        });
    }
    
    // Show a notification message
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        // Set notification content and type
        notification.textContent = message;
        notification.className = `notification ${type}`;
        
        // Show notification
        notification.style.display = 'block';
        
        // Hide after specified duration
        setTimeout(() => {
            notification.style.display = 'none';
        }, duration);
    }
}
