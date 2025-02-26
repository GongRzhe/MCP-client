#!/usr/bin/env python
"""
MCP Client Server Runner
Loads the correct dependencies and starts the MCP Client API server
"""

import os
import sys
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('mcp_server')

# Check if we're in a virtual environment
in_venv = sys.prefix != sys.base_prefix
if not in_venv:
    logger.warning("Not running in a virtual environment. It's recommended to run this server in a venv.")

# Set up paths
current_dir = os.path.dirname(os.path.abspath(__file__))
workspace_dir = os.path.dirname(current_dir)
frontend_dir = os.path.join(workspace_dir, 'front')

# Log server info
logger.info("==================================================")
logger.info(f"MCP Client Server starting on http://localhost:5000")
logger.info(f"Frontend directory: {frontend_dir}")
logger.info("==================================================")

# Import and apply the stdio_patch before importing the API module
try:
    logger.info("Applying asyncio stdio_client patch...")
    import stdio_patch
except ImportError as e:
    logger.warning(f"Could not import stdio_patch module: {e}")
    logger.warning("Will continue without the asyncio patch applied")

# Import and run the API server
try:
    import api
    # Explicitly run the Flask app instead of just importing the module
    port = int(os.environ.get('PORT', 5000))
    logger.info(f"Starting Flask application on port {port}")
    api.app.run(host='0.0.0.0', port=port, debug=True)
except ImportError as e:
    logger.error(f"Failed to import API module: {e}")
    logger.error("Make sure all dependencies are installed. Try: pip install -r requirements.txt")
    sys.exit(1)