/**
 * MCP Client - AI Providers Module
 * Handles connections and interactions with different AI model providers
 * Implements dynamic model loading and improved error handling
 */

class AIProviders {
    constructor() {
        // Provider configurations
        this.providers = {
            openai: {
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                models: [
                    { id: 'gpt-4o', name: 'GPT-4o' },
                    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
                    { id: 'gpt-4', name: 'GPT-4' },
                    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
                ],
                headers: (apiKey) => ({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }),
                formatRequest: (message, model) => ({
                    model: model,
                    messages: [{ role: 'user', content: message }],
                    temperature: 0.7
                }),
                extractResponse: (data) => data.choices[0].message.content,
                fetchModels: async (apiKey) => {
                    try {
                        const response = await fetch('https://api.openai.com/v1/models', {
                            headers: {
                                'Authorization': `Bearer ${apiKey}`
                            }
                        });
                        
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        
                        const data = await response.json();
                        
                        // Filter to include only GPT models
                        const supportedModels = data.data
                            .filter(model => model.id.includes('gpt'))
                            .map(model => ({
                                id: model.id,
                                name: model.id.replace(/^gpt-/, 'GPT ').replace(/-/g, ' ')
                            }))
                            .sort((a, b) => {
                                // Sort GPT-4 models first, then by name
                                const aIs4 = a.id.includes('gpt-4');
                                const bIs4 = b.id.includes('gpt-4');
                                
                                if (aIs4 && !bIs4) return -1;
                                if (!aIs4 && bIs4) return 1;
                                return a.name.localeCompare(b.name);
                            });
                        
                        return supportedModels;
                    } catch (error) {
                        console.warn('Could not fetch OpenAI models:', error.message);
                        // Return default models when API call fails
                        return [
                            { id: 'gpt-4o', name: 'GPT-4o (Default)' },
                            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo (Default)' },
                            { id: 'gpt-4', name: 'GPT-4 (Default)' },
                            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Default)' }
                        ];
                    }
                }
            },
            gemini: {
                name: 'Google Gemini',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                models: [
                    { id: 'gemini-pro', name: 'Gemini Pro' },
                    { id: 'gemini-ultra', name: 'Gemini Ultra' }
                ],
                defaultModel: 'gemini-pro',
                requiresApiKey: true,
                apiKeyName: 'GOOGLE_API_KEY',
                headers: (apiKey) => ({
                    'Content-Type': 'application/json'
                }),
                formatRequest: (message, model) => ({
                    contents: [{ parts: [{ text: message }] }],
                    generationConfig: { temperature: 0.7 }
                }),
                extractResponse: (data) => data.candidates[0].content.parts[0].text,
                fetchModels: async (apiKey) => {
                    try {
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                        
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        
                        const data = await response.json();
                        
                        // Filter to include only Gemini models
                        const supportedModels = data.models
                            .filter(model => model.name.includes('gemini'))
                            .map(model => ({
                                id: model.name.split('/').pop(),
                                name: model.displayName || model.name.split('/').pop()
                            }));
                        
                        return supportedModels;
                    } catch (error) {
                        console.warn('Could not fetch Gemini models:', error.message);
                        // Return default models when API call fails
                        return [
                            { id: 'gemini-pro', name: 'Gemini Pro (Default)' },
                            { id: 'gemini-ultra', name: 'Gemini Ultra (Default)' }
                        ];
                    }
                }
            },
            anthropic: {
                name: 'Anthropic',
                baseUrl: 'https://api.anthropic.com/v1',
                models: [
                    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
                    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
                    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
                    { id: 'claude-2.1', name: 'Claude 2.1' }
                ],
                headers: (apiKey) => ({
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                }),
                formatRequest: (message, model) => ({
                    model: model,
                    messages: [{ role: 'user', content: message }],
                    max_tokens: 1000
                }),
                extractResponse: (data) => data.content[0].text,
                fetchModels: async (apiKey) => {
                    try {
                        // Anthropic doesn't have a models endpoint, but we can check API access
                        const response = await fetch('https://api.anthropic.com/v1/messages', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-api-key': apiKey,
                                'anthropic-version': '2023-06-01'
                            },
                            body: JSON.stringify({
                                model: 'claude-3-haiku-20240307',
                                messages: [{ role: 'user', content: 'Hello' }],
                                max_tokens: 10
                            })
                        });
                        
                        // If we can access the API, return the standard models
                        if (response.ok) {
                            return [
                                { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
                                { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
                                { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
                                { id: 'claude-2.1', name: 'Claude 2.1' },
                                { id: 'claude-2.0', name: 'Claude 2.0' }
                            ];
                        } else {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                    } catch (error) {
                        console.warn('Could not check Anthropic API access:', error.message);
                        // Return default models when API check fails
                        return [
                            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Default)' },
                            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet (Default)' },
                            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Default)' },
                            { id: 'claude-2.1', name: 'Claude 2.1 (Default)' }
                        ];
                    }
                }
            },
            openroute: {
                name: 'OpenRoute',
                baseUrl: 'https://openrouter.ai/api/v1',
                models: [
                    { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o' },
                    { id: 'anthropic/claude-3-opus', name: 'Anthropic Claude 3 Opus' },
                    { id: 'google/gemini-pro', name: 'Google Gemini Pro' },
                    { id: 'meta-llama/llama-3-70b-instruct', name: 'Meta Llama 3 70B' }
                ],
                headers: (apiKey) => ({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'MCP Client'
                }),
                formatRequest: (message, model) => ({
                    model: model,
                    messages: [{ role: 'user', content: message }]
                }),
                extractResponse: (data) => data.choices[0].message.content,
                fetchModels: async (apiKey) => {
                    try {
                        const response = await fetch('https://openrouter.ai/api/v1/models', {
                            headers: {
                                'Authorization': `Bearer ${apiKey}`
                            }
                        });
                        
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        
                        const data = await response.json();
                        
                        // Map available models
                        const supportedModels = data.data.map(model => ({
                            id: model.id,
                            name: model.name || model.id
                        }));
                        
                        return supportedModels;
                    } catch (error) {
                        console.warn('Could not fetch OpenRoute models:', error.message);
                        // Return default models when API call fails
                        return [
                            { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o (Default)' },
                            { id: 'anthropic/claude-3-opus', name: 'Anthropic Claude 3 Opus (Default)' },
                            { id: 'google/gemini-pro', name: 'Google Gemini Pro (Default)' },
                            { id: 'meta-llama/llama-3-70b-instruct', name: 'Meta Llama 3 70B (Default)' }
                        ];
                    }
                }
            },
            groq: {
                name: 'Groq',
                baseUrl: 'https://api.groq.com/openai/v1',
                models: [
                    { id: 'llama3-70b-8192', name: 'Llama-3 70B' },
                    { id: 'llama3-8b-8192', name: 'Llama-3 8B' },
                    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
                    { id: 'gemma-7b-it', name: 'Gemma 7B' }
                ],
                headers: (apiKey) => ({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }),
                formatRequest: (message, model) => ({
                    model: model,
                    messages: [{ role: 'user', content: message }],
                    temperature: 0.7
                }),
                extractResponse: (data) => data.choices[0].message.content,
                fetchModels: async (apiKey) => {
                    try {
                        const response = await fetch('https://api.groq.com/openai/v1/models', {
                            headers: {
                                'Authorization': `Bearer ${apiKey}`
                            }
                        });
                        
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        
                        const data = await response.json();
                        
                        // Map available models
                        const supportedModels = data.data.map(model => ({
                            id: model.id,
                            name: model.id
                        }));
                        
                        return supportedModels;
                    } catch (error) {
                        console.warn('Could not fetch Groq models:', error.message);
                        // Return default models when API call fails
                        return [
                            { id: 'llama3-70b-8192', name: 'Llama-3 70B (Default)' },
                            { id: 'llama3-8b-8192', name: 'Llama-3 8B (Default)' },
                            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Default)' },
                            { id: 'gemma-7b-it', name: 'Gemma 7B (Default)' }
                        ];
                    }
                }
            },
            ollama: {
                name: 'Ollama',
                baseUrl: 'http://localhost:11434/api',
                models: [
                    { id: 'llama3', name: 'Llama 3' },
                    { id: 'mistral', name: 'Mistral' },
                    { id: 'gemma', name: 'Gemma' },
                    { id: 'phi', name: 'Phi' }
                ],
                headers: () => ({
                    'Content-Type': 'application/json'
                }),
                formatRequest: (message, model) => ({
                    model: model,
                    prompt: message,
                    stream: false
                }),
                extractResponse: (data) => data.response,
                fetchModels: async () => {
                    try {
                        // Add timeout to prevent long hanging requests
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 3000);
                        
                        const response = await fetch('http://localhost:11434/api/tags', {
                            signal: controller.signal
                        });
                        
                        clearTimeout(timeoutId);
                        
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        
                        const data = await response.json();
                        return data.models.map(model => ({
                            id: model.name,
                            name: model.name
                        }));
                    } catch (error) {
                        console.warn('Could not connect to Ollama:', error.message);
                        // Return default models when Ollama is not available
                        return [
                            { id: 'llama3', name: 'Llama 3 (Ollama not connected)' },
                            { id: 'mistral', name: 'Mistral (Ollama not connected)' },
                            { id: 'gemma', name: 'Gemma (Ollama not connected)' },
                            { id: 'phi', name: 'Phi (Ollama not connected)' }
                        ];
                    }
                }
            }
        };

        // Initialize API keys from localStorage
        this.apiKeys = {};
        this.modelsCache = {};
        this.loadApiKeys();
    }

    // Get the list of available providers
    getProviders() {
        return Object.entries(this.providers).map(([id, provider]) => ({
            id,
            name: provider.name,
            requiresApiKey: provider.requiresApiKey
        }));
    }

    // Get models for a specific provider
    async getModels(providerId) {
        const provider = this.providers[providerId];
        if (!provider) return [];

        // Check cache first
        const cacheKey = `${providerId}_${this.getApiKey(providerId).substring(0, 5)}`;
        if (this.modelsCache[cacheKey]) {
            return this.modelsCache[cacheKey];
        }

        // For Ollama, no API key is needed
        if (providerId === 'ollama' && provider.fetchModels) {
            try {
                const models = await provider.fetchModels();
                if (models && models.length > 0) {
                    this.modelsCache[cacheKey] = models;
                    return models;
                }
            } catch (error) {
                console.warn('Could not fetch Ollama models, using defaults');
            }
        } 
        // For other providers, use the API key to fetch models if available
        else if (provider.fetchModels) {
            const apiKey = this.getApiKey(providerId);
            
            // Only try to fetch if we have an API key
            if (apiKey) {
                try {
                    const models = await provider.fetchModels(apiKey);
                    if (models && models.length > 0) {
                        this.modelsCache[cacheKey] = models;
                        return models;
                    }
                } catch (error) {
                    console.warn(`Could not fetch ${provider.name} models, using defaults:`, error);
                }
            }
        }

        // Return default models if dynamic fetching failed or is not available
        return provider.models || [];
    }

    // Clear models cache for a provider or all providers
    clearModelsCache(providerId = null) {
        if (providerId) {
            // Clear cache for a specific provider
            Object.keys(this.modelsCache).forEach(key => {
                if (key.startsWith(`${providerId}_`)) {
                    delete this.modelsCache[key];
                }
            });
        } else {
            // Clear all models cache
            this.modelsCache = {};
        }
    }

    // Save API key for a provider
    saveApiKey(providerId, apiKey) {
        this.apiKeys[providerId] = apiKey;
        localStorage.setItem('mcp_client_api_keys', JSON.stringify(this.apiKeys));
        
        // Clear models cache for this provider
        this.clearModelsCache(providerId);
    }

    // Load API keys from localStorage
    loadApiKeys() {
        try {
            const keys = localStorage.getItem('mcp_client_api_keys');
            if (keys) {
                this.apiKeys = JSON.parse(keys);
            }
        } catch (error) {
            console.error('Error loading API keys:', error);
        }
    }

    // Get API key for a provider
    getApiKey(providerId) {
        return this.apiKeys[providerId] || '';
    }

    // Test API key for a provider
    async testApiKey(providerId, apiKey) {
        const provider = this.providers[providerId];
        if (!provider) {
            return { success: false, message: `Provider ${providerId} not found` };
        }

        if (providerId === 'ollama') {
            return { success: true, message: 'No API key needed for Ollama' };
        }

        try {
            // Use the fetchModels function as an API key test if available
            if (provider.fetchModels) {
                const models = await provider.fetchModels(apiKey);
                if (models && models.length > 0) {
                    return { 
                        success: true, 
                        message: `Successfully authenticated with ${provider.name}`,
                        models: models
                    };
                }
            }
            
            // Otherwise, try a simple request
            let url = `${provider.baseUrl}`;
            let headers = provider.headers(apiKey);
            
            // Different endpoints for different providers
            switch (providerId) {
                case 'openai':
                    url += '/models';
                    break;
                case 'anthropic':
                    // Use a minimal messages request for Anthropic
                    url += '/messages';
                    return await this.testAnthropicKey(url, headers);
                case 'gemini':
                    url += `/models?${provider.apiKeyParam}=${apiKey}`;
                    break;
                case 'openroute':
                    url += '/models';
                    break;
                case 'groq':
                    url += '/models';
                    break;
            }
            
            // Add timeout to prevent long hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(url, { 
                headers,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                return { success: true, message: `Successfully authenticated with ${provider.name}` };
            } else {
                const error = await response.json().catch(() => ({}));
                return { 
                    success: false, 
                    message: `Authentication failed: ${error.error?.message || response.statusText}` 
                };
            }
        } catch (error) {
            // Special handling for network errors
            if (error.name === 'AbortError') {
                return { 
                    success: false, 
                    message: `Connection timed out when testing ${provider.name} API key` 
                };
            } else if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                return { 
                    success: false, 
                    message: `Network error: Could not connect to ${provider.name} API. Check your internet connection.` 
                };
            }
            
            return { 
                success: false, 
                message: `Error testing API key: ${error.message}` 
            };
        }
    }

    // Special test for Anthropic API key
    async testAnthropicKey(url, headers) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    messages: [{ role: 'user', content: 'Hello' }],
                    max_tokens: 10
                })
            });
            
            if (response.ok) {
                return { success: true, message: 'Successfully authenticated with Anthropic' };
            } else {
                const error = await response.json().catch(() => ({}));
                return { 
                    success: false, 
                    message: `Authentication failed: ${error.error?.message || response.statusText}` 
                };
            }
        } catch (error) {
            // Handle specific Anthropic API errors
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                return { 
                    success: false, 
                    message: `Network error: Could not connect to Anthropic API. Check your internet connection.` 
                };
            }
            
            return { 
                success: false, 
                message: `Error testing Anthropic API key: ${error.message}` 
            };
        }
    }

    // Send a message to the selected AI provider
    async sendMessage(providerId, modelId, message) {
        const provider = this.providers[providerId];
        if (!provider) {
            throw new Error(`Provider ${providerId} not found`);
        }

        const apiKey = this.getApiKey(providerId);
        if (!apiKey && providerId !== 'ollama') {
            throw new Error(`API key required for ${provider.name}`);
        }

        let url = `${provider.baseUrl}`;
        
        // Endpoint paths differ by provider
        switch (providerId) {
            case 'openai':
            case 'openroute':
            case 'groq':
                url += '/chat/completions';
                break;
            case 'gemini':
                url += `/models/${modelId}:generateContent`;
                if (provider.apiKeyParam) {
                    url += `?${provider.apiKeyParam}=${apiKey}`;
                }
                break;
            case 'anthropic':
                url += '/messages';
                break;
            case 'ollama':
                url += '/generate';
                break;
        }

        const requestBody = provider.formatRequest(message, modelId);
        const headers = provider.headers(apiKey);

        try {
            // Add timeout to prevent long hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
            
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || errorData.message || response.statusText;
                throw new Error(`API Error (${response.status}): ${errorMessage}`);
            }

            const data = await response.json();
            const responseText = provider.extractResponse(data);
            
            return {
                response: responseText,
                raw: data  // Include raw response for advanced usage
            };
        } catch (error) {
            console.error(`Error with ${provider.name} API:`, error);
            
            // Provide more user-friendly error messages
            if (error.name === 'AbortError') {
                throw new Error(`Request to ${provider.name} timed out after 60 seconds. Please try again later.`);
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                if (providerId === 'ollama') {
                    throw new Error(`Could not connect to Ollama. Make sure Ollama is running locally on port 11434.`);
                } else {
                    throw new Error(`Network error when connecting to ${provider.name}. Please check your internet connection.`);
                }
            } else {
                throw error;
            }
        }
    }

    // Format error messages to be more user-friendly
    formatErrorMessage(error, provider) {
        if (!error) return "Unknown error occurred";
        
        // Handle common API errors with friendly messages
        if (error.includes('401') || error.includes('authentication')) {
            return `Authentication failed with ${provider}. Please check your API key.`;
        }
        
        if (error.includes('429') || error.includes('rate limit') || error.includes('quota')) {
            return `Rate limit exceeded for ${provider}. Please try again later or check your account quota.`;
        }
        
        if (error.includes('500') || error.includes('502') || error.includes('503') || error.includes('504')) {
            return `${provider} server error. The service might be experiencing issues. Please try again later.`;
        }
        
        return error;
    }

    // Get default model for a provider
    getDefaultModel(providerId) {
        const provider = this.providers[providerId];
        if (!provider) return null;
        return provider.defaultModel;
    }
}

// Create singleton instance
const aiProviders = new AIProviders();

// Export globally
window.aiProviders = aiProviders;