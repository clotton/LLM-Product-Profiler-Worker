/**
 * LLM Product Profiler - Cloudflare Worker
 * 
 * Provides two main endpoints:
 * 1. /api/fetch-url - CORS proxy for fetching external product pages
 * 2. /api/openai - Secure proxy for Azure OpenAI API calls
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }
    
    // Route requests to appropriate handlers
    if (url.pathname === '/api/fetch-url') {
      return handleProxyRequest(url, env);
    }
    
    if (url.pathname === '/api/openai') {
      return handleOpenAIRequest(request, env);
    }
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }
    
    return jsonResponse({ error: 'Not Found' }, 404);
  }
};

/**
 * Handle CORS preflight requests
 */
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, api-key',
      'Access-Control-Max-Age': '86400',
    }
  });
}

/**
 * Add CORS headers to response
 */
function addCORSHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, api-key');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Handle proxy requests for external URLs (CORS bypass)
 * GET /api/fetch-url?url=https://example.com/product
 */
async function handleProxyRequest(url, env) {
  try {
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return jsonResponse({ error: 'Missing url parameter' }, 400);
    }
    
    // Validate URL format
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return jsonResponse({ error: 'Invalid URL - must start with http:// or https://' }, 400);
    }
    
    console.log(`[Proxy] Fetching: ${targetUrl}`);
    
    // Fetch the external URL with browser-like headers
    // Match the original Python proxy behavior: use identity encoding and automatic redirects
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Referer': targetUrl,
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      },
      redirect: 'follow'
    });
    
    if (!response.ok) {
      console.error(`[Proxy] HTTP Error: ${response.status} - ${response.statusText}`);
      return jsonResponse({ 
        error: `Failed to fetch URL: ${response.status} - ${response.statusText}` 
      }, 502);
    }
    
    // Get the content
    const content = await response.text();
    const contentType = response.headers.get('Content-Type') || 'text/html';
    
    console.log(`[Proxy] Success: ${content.length} bytes fetched`);
    
    // Return the content with CORS headers
    const proxyResponse = new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
    
    return proxyResponse;
    
  } catch (error) {
    console.error('[Proxy] Error:', error);
    return jsonResponse({ 
      error: `Failed to fetch URL: ${error.message}` 
    }, 500);
  }
}

/**
 * Handle Azure OpenAI API requests
 * POST /api/openai
 * Body: { messages: [...], max_completion_tokens: 1500, response_format?: {...} }
 */
async function handleOpenAIRequest(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  
  try {
    // Validate environment variables
    if (!env.AZURE_OPENAI_KEY || !env.AZURE_OPENAI_ENDPOINT || !env.AZURE_OPENAI_MODEL) {
      console.error('[OpenAI] Missing required environment variables');
      return jsonResponse({ 
        error: 'Azure OpenAI not configured on server' 
      }, 500);
    }
    
    // Parse request body
    const body = await request.json();
    const { messages, max_completion_tokens = 1500, response_format } = body;
    
    if (!messages || !Array.isArray(messages)) {
      return jsonResponse({ error: 'Invalid request: messages array required' }, 400);
    }
    
    // Build Azure OpenAI endpoint
    const apiVersion = env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';
    const azureEndpoint = `${env.AZURE_OPENAI_ENDPOINT}openai/deployments/${env.AZURE_OPENAI_MODEL}/chat/completions?api-version=${apiVersion}`;
    
    console.log('[OpenAI] Making Azure OpenAI API request');
    
    // Prepare request body
    const requestBody = {
      messages,
      max_completion_tokens
    };
    
    // Add response format if specified (for JSON mode)
    if (response_format) {
      requestBody.response_format = response_format;
    }
    
    // Call Azure OpenAI API
    const response = await fetch(azureEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': env.AZURE_OPENAI_KEY
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('[OpenAI] Azure API error:', response.status, errorData);
      return jsonResponse({ 
        error: `Azure OpenAI API error: ${response.statusText}`,
        details: errorData
      }, response.status);
    }
    
    const result = await response.json();
    console.log('[OpenAI] Azure API call successful');
    
    // Return the result with CORS headers
    return addCORSHeaders(new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('[OpenAI] Error:', error);
    return jsonResponse({ 
      error: `Failed to process OpenAI request: ${error.message}` 
    }, 500);
  }
}

/**
 * Helper to create JSON responses with CORS headers
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, api-key',
    }
  });
}

