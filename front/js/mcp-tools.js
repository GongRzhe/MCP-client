/**
 * MCP Client - MCP Tools Module
 * Handles loading, parsing, and using MCP tools from a configuration file
 * Implements proper MCP protocol communication with servers
 */

class MCPTools {
    constructor() {
        this.config = null;
        this.activeTools = {};
        this.toolsPanel = null;
        this.toolsList = null;
        this.connectedServers = new Set(); // Keep track of connected servers
    }

    // Initialize the MCP tools module
    init(toolsListElement, toolsPanelElement) {
        this.toolsList = toolsListElement;
        this.toolsPanel = toolsPanelElement;
        
        // Load config from localStorage if available
        this.loadSavedConfig();

        // Check if we have API access
        this.hasApiAccess = !!window.mcpApi;
    }

    // Load MCP config from a file
    async loadConfigFromFile(file) {
        try {
            const text = await file.text();
            const config = JSON.parse(text);
            
            if (!this.validateConfig(config)) {
                throw new Error('Invalid MCP configuration format');
            }
            
            this.config = config;
            this.saveConfig();
            this.renderToolsList();
            
            // Show notification if we have access to the app
            if (window.app && window.app.showNotification) {
                window.app.showNotification('MCP configuration loaded successfully', 'success');
            } else {
                console.log('MCP configuration loaded successfully');
            }
            
            return true;
        } catch (error) {
            console.error('Error loading MCP config:', error);
            
            // Show notification if we have access to the app
            if (window.app && window.app.showNotification) {
                window.app.showNotification(`Error loading MCP config: ${error.message}`, 'error');
            } else {
                alert(`Error loading MCP config: ${error.message}`);
            }
            
            return false;
        }
    }

    // Validate the MCP configuration format
    validateConfig(config) {
        // Basic validation - check if it has mcpServers property
        if (!config || !config.mcpServers || typeof config.mcpServers !== 'object') {
            return false;
        }
        
        // Check if at least one server is defined
        return Object.keys(config.mcpServers).length > 0;
    }

    // Save config to localStorage
    saveConfig() {
        if (this.config) {
            localStorage.setItem('mcp_client_config', JSON.stringify(this.config));
        }
    }

    // Load saved config from localStorage
    loadSavedConfig() {
        try {
            // First try to load from mcp-config.json file
            fetch('mcp-config.json')
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to load mcp-config.json');
                    }
                    return response.json();
                })
                .then(config => {
                    if (this.validateConfig(config)) {
                        this.config = config;
                        this.saveConfig(); // Also save to localStorage
                        this.renderToolsList();
                        console.log('MCP configuration loaded from mcp-config.json');
                    }
                })
                .catch(err => {
                    console.warn('Could not load mcp-config.json, falling back to localStorage:', err);
                    // Fallback to localStorage
                    const savedConfig = localStorage.getItem('mcp_client_config');
                    if (savedConfig) {
                        this.config = JSON.parse(savedConfig);
                        this.renderToolsList();
                    }
                });
        } catch (error) {
            console.error('Error loading saved MCP config:', error);
        }
    }

    // Render the list of available MCP tools
    renderToolsList() {
        if (!this.toolsList || !this.config) return;
        
        // Clear existing content
        this.toolsList.innerHTML = '';
        
        let hasTools = false;
        
        // Iterate through servers and their tools/resources
        for (const [serverName, serverConfig] of Object.entries(this.config.mcpServers)) {
            // Create server section
            const serverSection = document.createElement('div');
            serverSection.className = 'server-section';
            serverSection.dataset.server = serverName;
            
            // Determine server status
            const isConnected = this.connectedServers.has(serverName);
            const isDisabled = serverConfig.disabled === true;
            
            // Apply appropriate class based on status
            if (isDisabled) {
                serverSection.classList.add('server-stopped');
            } else if (isConnected) {
                serverSection.classList.add('server-running');
            } else {
                serverSection.classList.add('server-stopped');
            }
            
            const serverHeader = document.createElement('div');
            serverHeader.className = 'server-header';
            
            const serverTitle = document.createElement('h4');
            serverTitle.textContent = serverName;
            serverHeader.appendChild(serverTitle);
            
            // Add server status
            const serverStatus = document.createElement('span');
            serverStatus.className = 'server-status';
            
            if (isDisabled) {
                serverStatus.textContent = 'Disabled';
                serverStatus.style.color = 'var(--secondary-color)';
            } else if (isConnected) {
                serverStatus.textContent = 'Connected';
                serverStatus.style.color = 'var(--success-color)';
            } else {
                serverStatus.textContent = 'Disconnected';
                serverStatus.style.color = 'var(--warning-color)';
            }
            
            serverHeader.appendChild(serverStatus);
            serverSection.appendChild(serverHeader);
            
            // Add server controls
            const serverControls = document.createElement('div');
            serverControls.className = 'server-controls';
            
            // Add connect button
            const connectButton = document.createElement('button');
            connectButton.className = 'btn server-connect';
            connectButton.textContent = isConnected ? 'Disconnect' : 'Connect';
            connectButton.disabled = isDisabled;
            connectButton.addEventListener('click', () => this.toggleServerConnection(serverName, !isConnected));
            serverControls.appendChild(connectButton);
            
            // Add toggle button
            const toggleButton = document.createElement('button');
            toggleButton.className = 'btn server-toggle';
            toggleButton.textContent = serverConfig.disabled ? 'Enable' : 'Disable';
            toggleButton.addEventListener('click', () => this.toggleServerStatus(serverName));
            serverControls.appendChild(toggleButton);
            
            serverSection.appendChild(serverControls);
            
            // Add tools if available
            if (serverConfig.tools && serverConfig.tools.length > 0) {
                hasTools = true;
                
                const toolsHeader = document.createElement('h5');
                toolsHeader.textContent = 'Tools';
                serverSection.appendChild(toolsHeader);
                
                const toolsList = document.createElement('div');
                toolsList.className = 'tools-list-container';
                
                serverConfig.tools.forEach(tool => {
                    const toolName = typeof tool === 'string' ? tool : tool.name;
                    const toolDescription = typeof tool === 'object' && tool.description ? tool.description : '';
                    
                    const toolItem = document.createElement('div');
                    toolItem.className = 'tool-item';
                    toolItem.dataset.server = serverName;
                    toolItem.dataset.tool = toolName;
                    
                    const toolNameElement = document.createElement('div');
                    toolNameElement.className = 'tool-name';
                    toolNameElement.textContent = toolName;
                    toolItem.appendChild(toolNameElement);
                    
                    if (toolDescription) {
                        const toolDescElement = document.createElement('div');
                        toolDescElement.className = 'tool-description';
                        toolDescElement.textContent = toolDescription;
                        toolItem.appendChild(toolDescElement);
                    }
                    
                    toolItem.addEventListener('click', () => this.activateTool(serverName, toolName));
                    
                    toolsList.appendChild(toolItem);
                });
                
                serverSection.appendChild(toolsList);
            }
            
            // Add resources if available
            if (serverConfig.resources && serverConfig.resources.length > 0) {
                hasTools = true;
                
                const resourcesHeader = document.createElement('h5');
                resourcesHeader.textContent = 'Resources';
                serverSection.appendChild(resourcesHeader);
                
                const resourcesList = document.createElement('div');
                resourcesList.className = 'resources-list-container';
                
                serverConfig.resources.forEach(resource => {
                    const resourceName = typeof resource === 'string' ? resource : resource.name;
                    const resourceUri = typeof resource === 'object' && resource.uri ? resource.uri : resource;
                    
                    const resourceItem = document.createElement('div');
                    resourceItem.className = 'tool-item resource-item';
                    resourceItem.dataset.server = serverName;
                    resourceItem.dataset.resource = resourceUri;
                    
                    const resourceNameElement = document.createElement('div');
                    resourceNameElement.className = 'resource-name';
                    resourceNameElement.textContent = resourceName;
                    resourceItem.appendChild(resourceNameElement);
                    
                    const resourceUriElement = document.createElement('div');
                    resourceUriElement.className = 'resource-uri';
                    resourceUriElement.textContent = resourceUri;
                    resourceItem.appendChild(resourceUriElement);
                    
                    resourceItem.addEventListener('click', () => 
                        this.accessResource(serverName, resourceUri));
                    
                    resourcesList.appendChild(resourceItem);
                });
                
                serverSection.appendChild(resourcesList);
            }
            
            this.toolsList.appendChild(serverSection);
        }
        
        // Add button to add new MCP config
        const addConfigContainer = document.createElement('div');
        addConfigContainer.className = 'add-config-container';
        
        const addConfigButton = document.createElement('button');
        addConfigButton.className = 'btn add-config';
        addConfigButton.textContent = 'Load MCP Config';
        addConfigButton.addEventListener('click', () => {
            const fileInput = document.getElementById('config-file');
            if (fileInput) {
                fileInput.click();
            }
        });
        addConfigContainer.appendChild(addConfigButton);
        
        this.toolsList.appendChild(addConfigContainer);
        
        // Show message if no tools available
        if (!hasTools) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'No MCP tools available in config. Please load a configuration file.';
            this.toolsList.appendChild(emptyMessage);
        }
    }

    // Toggle server enabled/disabled status
    toggleServerStatus(serverName) {
        if (!this.config || !this.config.mcpServers[serverName]) return;
        
        // Toggle disabled state
        this.config.mcpServers[serverName].disabled = !this.config.mcpServers[serverName].disabled;
        
        // Save updated config
        this.saveConfig();
        
        // If we're disabling and the server is connected, disconnect
        if (this.config.mcpServers[serverName].disabled && this.connectedServers.has(serverName)) {
            this.toggleServerConnection(serverName, false);
        }
        
        // Re-render tools list
        this.renderToolsList();
        
        // Show notification
        if (window.app && window.app.showNotification) {
            window.app.showNotification(
                `Server ${serverName} ${this.config.mcpServers[serverName].disabled ? 'disabled' : 'enabled'}`,
                'info'
            );
        }
    }

    // Check if a server is connected
    isServerConnected(serverName) {
        return this.connectedServers.has(serverName);
    }
    
    // Toggle server connection
    async toggleServerConnection(serverName, connect) {
        if (!this.hasApiAccess) {
            console.error('API access not available');
            if (window.app && window.app.showNotification) {
                window.app.showNotification('API access not available', 'error');
            }
            return;
        }
        
        if (!this.config || !this.config.mcpServers[serverName]) return;
        
        try {
            if (connect) {
                // Connect to server
                const result = await mcpApi.connectToMcpServer(serverName);
                
                if (result.success) {
                    this.connectedServers.add(serverName);
                    if (window.app && window.app.showNotification) {
                        window.app.showNotification(`Connected to ${serverName}`, 'success');
                    }
                } else {
                    if (window.app && window.app.showNotification) {
                        window.app.showNotification(`Failed to connect to ${serverName}: ${result.message}`, 'error');
                    }
                }
            } else {
                // Disconnect from server
                // Note: There's no explicit disconnect API in mcpApi, so we just update our local state
                this.connectedServers.delete(serverName);
                if (window.app && window.app.showNotification) {
                    window.app.showNotification(`Disconnected from ${serverName}`, 'info');
                }
            }
            
            // Re-render tools list
            this.renderToolsList();
        } catch (error) {
            console.error(`Error ${connect ? 'connecting to' : 'disconnecting from'} server ${serverName}:`, error);
            if (window.app && window.app.showNotification) {
                window.app.showNotification(`Error ${connect ? 'connecting to' : 'disconnecting from'} server: ${error.message}`, 'error');
            }
        }
    }

    // Activate a tool and show its interface in the tools panel
    async activateTool(serverName, toolName) {
        if (!this.toolsPanel) return null;
        
        console.log(`Activating tool ${toolName} on server ${serverName}`);
        
        // Check if server is connected
        if (!this.connectedServers.has(serverName)) {
            // Try to connect to the server first
            if (!this.config.mcpServers[serverName].disabled) {
                console.log(`Server ${serverName} not connected. Attempting to connect...`);
                await this.toggleServerConnection(serverName, true);
                
                // Return if connection failed
                if (!this.connectedServers.has(serverName)) {
                    if (window.app && window.app.showNotification) {
                        window.app.showNotification(`Failed to connect to server ${serverName}`, 'error');
                    }
                    return null;
                }
            } else {
                if (window.app && window.app.showNotification) {
                    window.app.showNotification(`Server "${serverName}" is disabled. Please enable it first.`, 'warning');
                }
                return null;
            }
        }
        
        // Show the tools panel
        this.toolsPanel.classList.add('active');
        
        // Create a unique ID for this tool instance
        const toolId = `tool-${serverName}-${toolName}-${Date.now()}`;
        
        // Find tool config
        const serverConfig = this.config.mcpServers[serverName];
        let toolConfig = null;
        
        if (serverConfig && serverConfig.tools) {
            for (const tool of serverConfig.tools) {
                if ((typeof tool === 'string' && tool === toolName) || 
                    (typeof tool === 'object' && tool.name === toolName)) {
                    toolConfig = tool;
                    break;
                }
            }
        }
        
        // Get tool schema from API if available
        let toolSchema = null;
        if (this.hasApiAccess) {
            try {
                const tools = await mcpApi.getMcpTools(serverName);
                for (const tool of tools) {
                    if (tool.name === toolName) {
                        toolSchema = tool.schema;
                        break;
                    }
                }
            } catch (error) {
                console.error(`Error getting tool schema for ${toolName}:`, error);
            }
        }
        
        // Create tool interface
        const toolInterface = document.createElement('div');
        toolInterface.className = 'tool-interface';
        toolInterface.id = toolId;
        
        const toolHeader = document.createElement('h4');
        toolHeader.textContent = toolName;
        toolInterface.appendChild(toolHeader);
        
        const serverInfo = document.createElement('p');
        serverInfo.textContent = `Server: ${serverName}`;
        toolInterface.appendChild(serverInfo);
        
        // Add tool description if available
        if (toolConfig && typeof toolConfig === 'object' && toolConfig.description) {
            const description = document.createElement('p');
            description.textContent = toolConfig.description;
            toolInterface.appendChild(description);
        }
        
        // Create form for tool parameters
        const toolForm = document.createElement('div');
        toolForm.className = 'tool-form';
        
        // Add input fields based on tool schema if available
        if (toolSchema) {
            this.createFormFromSchema(toolForm, toolSchema, toolId);
        } else if (toolConfig && typeof toolConfig === 'object' && toolConfig.inputSchema) {
            this.createFormFromSchema(toolForm, toolConfig.inputSchema, toolId);
        } else {
            // Default form with a single input
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = 'Input';
            label.htmlFor = `${toolId}-input`;
            formGroup.appendChild(label);
            
            const input = document.createElement('textarea');
            input.id = `${toolId}-input`;
            input.name = 'input';
            input.rows = 3;
            formGroup.appendChild(input);
            
            toolForm.appendChild(formGroup);
        }
        
        // Add execute button
        const executeButton = document.createElement('button');
        executeButton.className = 'btn primary';
        executeButton.textContent = 'Execute Tool';
        executeButton.addEventListener('click', () => this.executeTool(toolId, serverName, toolName));
        toolForm.appendChild(executeButton);
        
        // Add close button
        const closeButton = document.createElement('button');
        closeButton.className = 'btn';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => {
            toolInterface.remove();
            delete this.activeTools[toolId];
        });
        toolForm.appendChild(closeButton);
        
        toolInterface.appendChild(toolForm);
        
        // Add result container
        const resultContainer = document.createElement('div');
        resultContainer.className = 'tool-result';
        resultContainer.id = `${toolId}-result`;
        resultContainer.style.display = 'none';
        toolInterface.appendChild(resultContainer);
        
        // Add to active tools
        const activeToolsContainer = document.getElementById('active-tools');
        if (activeToolsContainer) {
            // Clear empty message if present
            const emptyMessage = activeToolsContainer.querySelector('.empty-message');
            if (emptyMessage) {
                emptyMessage.remove();
            }
            
            activeToolsContainer.appendChild(toolInterface);
        }
        
        // Store reference to active tool
        this.activeTools[toolId] = {
            serverName,
            toolName,
            element: toolInterface
        };
        
        return toolId;
    }
    
    // Create form inputs based on JSON schema
    createFormFromSchema(formContainer, schema, toolId) {
        if (!schema || !schema.properties) {
            return;
        }
        
        const properties = schema.properties;
        const required = schema.required || [];
        
        for (const [propName, propSchema] of Object.entries(properties)) {
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = `${propName}${required.includes(propName) ? ' *' : ''}`;
            label.htmlFor = `${toolId}-${propName}`;
            
            if (propSchema.description) {
                label.title = propSchema.description;
            }
            
            formGroup.appendChild(label);
            
            let input;
            
            // Create appropriate input based on type
            switch (propSchema.type) {
                case 'boolean':
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.className = 'toggle';
                    break;
                    
                case 'number':
                case 'integer':
                    input = document.createElement('input');
                    input.type = 'number';
                    if (propSchema.minimum !== undefined) input.min = propSchema.minimum;
                    if (propSchema.maximum !== undefined) input.max = propSchema.maximum;
                    break;
                    
                case 'string':
                    if (propSchema.enum) {
                        input = document.createElement('select');
                        propSchema.enum.forEach(option => {
                            const optionElement = document.createElement('option');
                            optionElement.value = option;
                            optionElement.textContent = option;
                            input.appendChild(optionElement);
                        });
                    } else if (propSchema.format === 'textarea' || 
                               propSchema.description && propSchema.description.includes('multiline')) {
                        input = document.createElement('textarea');
                        input.rows = 5;
                    } else {
                        input = document.createElement('input');
                        input.type = 'text';
                    }
                    break;
                    
                case 'object':
                case 'array':
                    input = document.createElement('textarea');
                    input.rows = 5;
                    input.placeholder = `Enter ${propSchema.type} as JSON`;
                    break;
                    
                default:
                    input = document.createElement('input');
                    input.type = 'text';
            }
            
            input.id = `${toolId}-${propName}`;
            input.name = propName;
            input.dataset.type = propSchema.type;
            
            if (required.includes(propName)) {
                input.required = true;
            }
            
            formGroup.appendChild(input);
            formContainer.appendChild(formGroup);
        }
    }
    
    // Execute a tool with the provided inputs
    async executeTool(toolId, serverName, toolName) {
        const toolInterface = document.getElementById(toolId);
        const resultContainer = document.getElementById(`${toolId}-result`);
        
        if (!toolInterface || !resultContainer) {
            return;
        }
        
        if (!this.hasApiAccess) {
            resultContainer.style.display = 'block';
            resultContainer.innerHTML = '<span style="color: var(--danger-color);">Error: API access not available</span>';
            return;
        }
        
        // Check if server is connected
        if (!this.connectedServers.has(serverName)) {
            resultContainer.style.display = 'block';
            resultContainer.innerHTML = '<span style="color: var(--danger-color);">Error: Server is not connected</span>';
            return;
        }
        
        // Show loading state
        resultContainer.style.display = 'block';
        resultContainer.innerHTML = '<div class="loading"></div> Executing tool...';
        
        // Collect inputs
        const inputs = {};
        const form = toolInterface.querySelector('.tool-form');
        const inputElements = form.querySelectorAll('input, textarea, select');
        
        try {
            inputElements.forEach(input => {
                if (!input.name || input.name === 'submit') return;
                
                let value = input.value;
                
                // Convert value based on data type
                if (input.dataset.type === 'boolean') {
                    value = input.checked;
                } else if (input.dataset.type === 'number' || input.dataset.type === 'integer') {
                    value = Number(value);
                } else if (input.dataset.type === 'object' || input.dataset.type === 'array') {
                    try {
                        value = JSON.parse(value);
                    } catch (error) {
                        throw new Error(`Invalid JSON in ${input.name}`);
                    }
                }
                
                inputs[input.name] = value;
            });
            
            // Call the tool via API
            const result = await mcpApi.callMcpTool(serverName, toolName, inputs);
            
            // Display result
            if (result.success) {
                resultContainer.innerHTML = `
                    <div class="result-header">Tool executed successfully</div>
                    <div class="result-content">${this.formatToolResult(result.result)}</div>
                `;
            } else {
                resultContainer.innerHTML = `
                    <div class="result-header error">Tool execution failed</div>
                    <div class="result-content">${this.formatToolResult(result.error || 'Unknown error')}</div>
                `;
            }
        } catch (error) {
            resultContainer.innerHTML = `
                <div class="result-header error">Error</div>
                <div class="result-content">${error.message}</div>
            `;
        }
    }
    
    // Format tool result for display
    formatToolResult(result) {
        if (!result) return 'No result';
        
        // If result is an object or array, format as JSON
        if (typeof result === 'object') {
            try {
                return `<pre>${JSON.stringify(result, null, 2)}</pre>`;
            } catch (e) {
                // If JSON stringify fails, try to convert to string
                return `<pre>${String(result)}</pre>`;
            }
        }
        
        // If result is a string that looks like HTML, escape it
        if (typeof result === 'string') {
            const escaped = result
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            
            // Add <pre> for formatting
            return `<pre>${escaped}</pre>`;
        }
        
        // For other types
        return `<pre>${String(result)}</pre>`;
    }
    
    // Access a resource from an MCP server
    async accessResource(serverName, resourceUri) {
        if (!this.hasApiAccess) {
            if (window.app && window.app.showNotification) {
                window.app.showNotification('API access not available', 'error');
            }
            return;
        }
        
        // Check if server is connected
        if (!this.connectedServers.has(serverName)) {
            if (window.app && window.app.showNotification) {
                window.app.showNotification(`Server "${serverName}" is not connected. Please connect first.`, 'warning');
            }
            return;
        }
        
        // Show the tools panel
        if (this.toolsPanel) {
            this.toolsPanel.classList.add('active');
        }
        
        // Create a unique ID for this resource access
        const resourceId = `resource-${Date.now()}`;
        
        // Create resource interface
        const resourceInterface = document.createElement('div');
        resourceInterface.className = 'tool-interface';
        resourceInterface.id = resourceId;
        
        const resourceHeader = document.createElement('h4');
        resourceHeader.textContent = 'Resource Access';
        resourceInterface.appendChild(resourceHeader);
        
        const resourceInfo = document.createElement('p');
        resourceInfo.innerHTML = `<strong>Server:</strong> ${serverName}<br><strong>URI:</strong> ${resourceUri}`;
        resourceInterface.appendChild(resourceInfo);
        
        // Add result container
        const resultContainer = document.createElement('div');
        resultContainer.className = 'tool-result';
        resultContainer.innerHTML = '<div class="loading"></div> Accessing resource...';
        resourceInterface.appendChild(resultContainer);
        
        // Add to active tools
        const activeToolsContainer = document.getElementById('active-tools');
        if (activeToolsContainer) {
            // Clear empty message if present
            const emptyMessage = activeToolsContainer.querySelector('.empty-message');
            if (emptyMessage) {
                emptyMessage.remove();
            }
            
            activeToolsContainer.appendChild(resourceInterface);
        }
        
        // Access the resource
        try {
            // In a real implementation, this would call the API to access the resource
            // Since there's no direct API for resources, we'll simulate it
            setTimeout(() => {
                resultContainer.innerHTML = `
                    <div class="result-header">Resource accessed</div>
                    <div class="result-content">
                        <pre>
{
  "resource": "${resourceUri}",
  "content": "Resource data would appear here",
  "type": "text/plain",
  "timestamp": "${new Date().toISOString()}"
}
                        </pre>
                    </div>
                `;
            }, 1000);
        } catch (error) {
            resultContainer.innerHTML = `
                <div class="result-header error">Error</div>
                <div class="result-content">${error.message}</div>
            `;
        }
    }
    
    // Close the tools panel
    closeToolsPanel() {
        if (this.toolsPanel) {
            this.toolsPanel.classList.remove('active');
        }
    }
    
    // Clear all active tools
    clearActiveTools() {
        const activeToolsContainer = document.getElementById('active-tools');
        if (activeToolsContainer) {
            activeToolsContainer.innerHTML = '<p class="empty-message">No active tools</p>';
        }
        
        this.activeTools = {};
    }
}

// Create and export a singleton instance
const mcpTools = new MCPTools();

// Export globally
window.mcpTools = mcpTools;
