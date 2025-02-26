#!/usr/bin/env python
"""
Advanced patch for the MCP stdio_client module to fix asyncio task scope errors
This patch replaces the stdio_client with a custom implementation that avoids the task scope issues
"""

import os
import sys
import asyncio
import logging
import anyio
from anyio.streams.text import TextReceiveStream
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from contextlib import asynccontextmanager
from typing import Literal

logger = logging.getLogger('mcp_api')

# Import necessary types from MCP
try:
    import mcp.types as types
    from mcp.client.stdio import StdioServerParameters
    from mcp.client.session import ClientSession
    from mcp.client.stdio import get_default_environment
except ImportError:
    logger.error("MCP SDK not found, cannot apply patch")
    raise

# Custom implementation of stdio_client to avoid task scope issues
@asynccontextmanager
async def robust_stdio_client(server: StdioServerParameters):
    """
    Custom implementation of stdio_client that avoids task scope issues
    by using a more robust approach to task management
    """
    read_stream_writer, read_stream = anyio.create_memory_object_stream(0)
    write_stream, write_stream_reader = anyio.create_memory_object_stream(0)

    process = None
    tg = None
    
    try:
        # Open the process with the given parameters
        process = await anyio.open_process(
            [server.command, *server.args],
            env=server.env if server.env is not None else get_default_environment(),
            stderr=sys.stderr,
        )
        
        async def stdout_reader():
            try:
                if not process or not process.stdout:
                    logger.error("Process or stdout is missing")
                    return
                    
                buffer = ""
                async for chunk in TextReceiveStream(
                    process.stdout,
                    encoding=server.encoding,
                    errors=server.encoding_error_handler,
                ):
                    lines = (buffer + chunk).split("\n")
                    buffer = lines.pop()

                    for line in lines:
                        try:
                            message = types.JSONRPCMessage.model_validate_json(line)
                            await read_stream_writer.send(message)
                        except Exception as exc:
                            logger.warning(f"Error parsing JSON-RPC message: {exc}")
                            try:
                                await read_stream_writer.send(exc)
                            except:
                                pass
            except (anyio.ClosedResourceError, asyncio.CancelledError):
                logger.info("stdout_reader task cancelled")
            except Exception as e:
                logger.error(f"Error in stdout_reader: {e}")
            finally:
                await anyio.lowlevel.checkpoint()

        async def stdin_writer():
            try:
                if not process or not process.stdin:
                    logger.error("Process or stdin is missing")
                    return
                    
                async for message in write_stream_reader:
                    json = message.model_dump_json(by_alias=True, exclude_none=True)
                    await process.stdin.send(
                        (json + "\n").encode(
                            encoding=server.encoding,
                            errors=server.encoding_error_handler,
                        )
                    )
            except (anyio.ClosedResourceError, asyncio.CancelledError):
                logger.info("stdin_writer task cancelled")
            except Exception as e:
                logger.error(f"Error in stdin_writer: {e}")
            finally:
                await anyio.lowlevel.checkpoint()
        
        # Create a task group for the reader and writer tasks
        tg = anyio.create_task_group()
        await tg.__aenter__()
        
        # Start the reader and writer tasks
        tg.start_soon(stdout_reader)
        tg.start_soon(stdin_writer)
        
        # Yield the streams
        yield read_stream, write_stream
    
    except Exception as e:
        logger.error(f"Error in robust_stdio_client: {e}")
        raise
    
    finally:
        # Clean up resources in the correct order
        try:
            # 1. Cancel and close task group if it exists
            if tg is not None and hasattr(tg, 'cancel_scope'):
                try:
                    await tg.cancel_scope.cancel()
                    await tg.__aexit__(None, None, None)
                except Exception as e:
                    logger.warning(f"Error closing task group: {e}")
            
            # 2. Close process if it exists
            if process is not None:
                try:
                    process.terminate()
                    await process.aclose()
                except Exception as e:
                    logger.warning(f"Error closing process: {e}")
            
            # 3. Close streams
            try:
                if read_stream_writer is not None:
                    await read_stream_writer.aclose()
            except Exception as e:
                logger.warning(f"Error closing read stream writer: {e}")
                
            try:
                if write_stream_reader is not None:
                    await write_stream_reader.aclose()
            except Exception as e:
                logger.warning(f"Error closing write stream reader: {e}")
                
        except Exception as e:
            logger.warning(f"Error during cleanup: {e}")

# Apply the patch by replacing the original function with our robust version
def apply_patch():
    """Apply the patch to the MCP SDK by replacing the original stdio_client function"""
    try:
        import mcp.client.stdio
        mcp.client.stdio.stdio_client = robust_stdio_client
        logger.info("Successfully applied robust stdio_client patch to address asyncio task scope errors")
        return True
    except Exception as e:
        logger.error(f"Failed to apply stdio_client patch: {e}")
        return False

# Auto-apply the patch when this module is imported
apply_patch()
