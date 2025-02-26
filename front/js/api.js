/**
 * MCP Client - API Module
 * Handles communication with the backend API
 */

class MCPClientAPI {
    constructor() {
        // Base URL for API requests - defaults to same host with backend port
        this.baseUrl = `${window.location.protocol}//${window.location.hostname}:5000/api`;
        
        // Cache for API keys and models
        this.apiKeys = this.loadApiKeys();
        this.modelsCache = {};
    }

    /**
     * Load API keys from localStorage
     */
    loadApiKeys() {
        try {
            const keys = localStorage.getItem('mcp_client_api_keys');
            return keys ? JSON.parse(keys) : {};
        } catch (error) {
            console.error('Error loading API keys:', error);
            return {};
        }
    }

    /**
     * Save API key for a provider
     * @param {string} providerId - Provider ID
     * @param {string} apiKey - API key
     */
    saveApiKey(providerId, apiKey) {
        this.apiKeys[providerId] = apiKey;
        localStorage.setItem('mcp_client_api_keys', JSON.stringify(this.apiKeys));
    }

    /**
     * Get API key for a provider
     * @param {string} providerId - Provider ID
     * @returns {string} API key
     */
    getApiKey(providerId) {
        return this.apiKeys[providerId] || '';
    }

    /**
     * Make API request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} Response data
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        // Default options
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        // Merge options
        const fetchOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {}),
            },
        };
        
        try {
            const response = await fetch(url, fetchOptions);
            
            // Parse JSON response
            const data = await response.json();
            
            // Check for API error
            if (!response.ok) {
                const errorMessage = data.error || `Error: ${response.status} ${response.statusText}`;
                throw new Error(errorMessage);
            }
            
            return data;
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    /**
     * Get available AI providers
     * @returns {Promise<Array>} List of available providers
     */
    async getProviders() {
        const data = await this.request('/providers');
        return data.providers || [];
    }

    /**
     * Get available models for a provider
     * @param {string} providerId - Provider ID
     * @returns {Promise<Array>} List of available models
     */
    async getModels(providerId) {
        // Return cached models if available
        if (this.modelsCache[providerId]) {
            return this.modelsCache[providerId];
        }
        
        const apiKey = this.getApiKey(providerId);
        const data = await this.request(`/models/${providerId}?api_key=${encodeURIComponent(apiKey)}`);
        
        // Cache the models
        this.modelsCache[providerId] = data.models || [];
        
        return data.models || [];
    }

    /**
     * Clear models cache for a provider
     * @param {string} providerId - Provider ID
     */
    clearModelsCache(providerId) {
        if (providerId) {
            delete this.modelsCache[providerId];
        } else {
            this.modelsCache = {};
        }
    }

    /**
     * Test API key for a provider
     * @param {string} providerId - Provider ID
     * @param {string} apiKey - API key to test
     * @returns {Promise<Object>} Test result
     */
    async testApiKey(providerId, apiKey) {
        try {
            // Using getModels as a way to test the API key
            const data = await this.request(`/models/${providerId}?api_key=${encodeURIComponent(apiKey)}`);
            
            // If we got models, the API key is valid
            return {
                success: true,
                message: `Successfully authenticated with ${providerId}`,
                models: data.models || []
            };
        } catch (error) {
            return {
                success: false,
                message: `Authentication failed: ${error.message}`
            };
        }
    }

    /**
     * Send a message to an AI provider
     * @param {string} providerId - Provider ID
     * @param {string} modelId - Model ID
     * @param {string} message - Message to send
     * @returns {Promise<Object>} AI response
     */
    async sendMessage(providerId, modelId, message) {
        const apiKey = this.getApiKey(providerId);
        
        const data = await this.request('/send_message', {
            method: 'POST',
            body: JSON.stringify({
                provider: providerId,
                model: modelId,
                api_key: apiKey,
                message
            })
        });
        
        return data;
    }

    /**
     * Get list of MCP servers
     * @returns {Promise<Array>} List of MCP servers
     */
    async getMcpServers() {
        const data = await this.request('/mcp/servers');
        return data.servers || [];
    }

    /**
     * Connect to a specific MCP server
     * @param {string} serverName - Server name
     * @returns {Promise<Object>} Connection result
     */
    async connectToMcpServer(serverName) {
        const data = await this.request('/mcp/connect', {
            method: 'POST',
            body: JSON.stringify({
                server: serverName
            })
        });
        
        return data;
    }

    /**
     * Connect to all enabled MCP servers
     * @returns {Promise<Object>} Connection result
     */
    async connectToAllMcpServers() {
        const data = await this.request('/mcp/connect-all', {
            method: 'POST'
        });
        
        return data;
    }

    /**
     * Get list of tools for a specific MCP server
     * @param {string} serverName - Server name
     * @returns {Promise<Array>} List of tools
     */
    async getMcpTools(serverName) {
        const data = await this.request(`/mcp/tools/${encodeURIComponent(serverName)}`);
        return data.tools || [];
    }

    /**
     * Call an MCP tool
     * @param {string} serverName - Server name
     * @param {string} toolName - Tool name
     * @param {Object} args - Tool arguments
     * @returns {Promise<Object>} Tool result
     */
    async callMcpTool(serverName, toolName, args = {}) {
        const data = await this.request('/mcp/call_tool', {
            method: 'POST',
            body: JSON.stringify({
                server: serverName,
                tool: toolName,
                args
            })
        });
        
        return data;
    }

    /**
     * Process a query using AI with MCP tools
     * @param {string} query - Query to process
     * @returns {Promise<Object>} AI response with tool interactions
     */
    async processWithAI(query) {
        const data = await this.request('/mcp/ai_process', {
            method: 'POST',
            body: JSON.stringify({
                query
            })
        });
        
        return data;
    }

    /**
     * Execute a terminal command using the terminal-controller MCP server
     * @param {string} command - Command to execute
     * @returns {Promise<Object>} Command result
     */
    async executeCommand(command) {
        return this.callMcpTool('terminal-controller', 'execute-command', {
            command
        });
    }

    /**
     * Check if the backend is available
     * @returns {Promise<boolean>} True if backend is available
     */
    async checkBackendAvailability() {
        try {
            // Try to get providers as a simple availability check
            await this.getProviders();
            return true;
        } catch (error) {
            console.error('Backend not available:', error);
            return false;
        }
    }

    /**
     * Get pre-configured example queries for AI
     * @returns {Array} Example queries
     */
    getExampleQueries() {
        return [];
    }
}

// Create singleton instance
const mcpApi = new MCPClientAPI();

// Export the API instance
window.mcpApi = mcpApi;