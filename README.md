# LLM Product Profiler - Cloudflare Worker

Backend API for the LLM Product Profiler. Provides secure proxy endpoints for CORS bypass and Azure OpenAI API calls.

## Features

- **CORS Proxy** (`/api/fetch-url`) - Fetches external product pages and bypasses CORS restrictions
- **Azure OpenAI Proxy** (`/api/openai`) - Securely handles Azure OpenAI API calls with server-side credentials
- **Environment-based secrets** - API keys stored securely in Cloudflare Workers environment
- **Browser-like headers** - Mimics real browser requests to avoid bot detection
- **Health check endpoint** (`/health`) - Monitor worker status

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- Cloudflare account
- Azure OpenAI API credentials

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Wrangler

Login to Cloudflare:

```bash
wrangler login
```

Update `wrangler.toml` with your Cloudflare account ID:

```toml
account_id = "your-cloudflare-account-id"
```

### 3. Set Environment Variables

For **local development**, create a `.dev.vars` file:

```bash
cp .env.example .dev.vars
# Edit .dev.vars with your actual credentials
```

For **production**, use Wrangler secrets:

```bash
wrangler secret put AZURE_OPENAI_KEY
wrangler secret put AZURE_OPENAI_ENDPOINT
wrangler secret put AZURE_OPENAI_MODEL
```

**Required secrets:**
- `AZURE_OPENAI_KEY` - Your Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT` - Azure OpenAI endpoint (e.g., `https://your-resource.openai.azure.com/`)
- `AZURE_OPENAI_MODEL` - Deployment name (e.g., `gpt-4.1`)

## Development

Start local development server:

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`

Test endpoints:

```bash
# Health check
curl http://localhost:8787/health

# Test CORS proxy
curl "http://localhost:8787/api/fetch-url?url=https://example.com"

# Test OpenAI endpoint (POST request)
curl -X POST http://localhost:8787/api/openai \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "max_completion_tokens": 100
  }'
```

## Deployment

### Deploy to Development

```bash
npm run deploy
```

### Deploy to Production

```bash
npm run deploy:production
```

After deployment, note the Worker URL (e.g., `https://llm-product-profiler-worker.your-subdomain.workers.dev`)

## API Endpoints

### GET /api/fetch-url

Proxy external URLs to bypass CORS.

**Query Parameters:**
- `url` (required) - Full URL to fetch (must start with http:// or https://)

**Example:**
```bash
GET /api/fetch-url?url=https://example.com/product-page
```

**Response:**
- `200` - Returns the HTML content with CORS headers
- `400` - Invalid or missing URL parameter
- `502` - Failed to fetch the URL
- `500` - Server error

### POST /api/openai

Proxy Azure OpenAI API calls securely.

**Request Body:**
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a product analyst."
    },
    {
      "role": "user",
      "content": "Analyze this product..."
    }
  ],
  "max_completion_tokens": 1500,
  "response_format": { "type": "json_object" }
}
```

**Response:**
- `200` - Returns Azure OpenAI API response
- `400` - Invalid request format
- `500` - Azure OpenAI API error or configuration issue

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

## Monitoring

View real-time logs:

```bash
npm run tail
```

Or with Wrangler directly:

```bash
wrangler tail
```

## Security Notes

- **Never commit secrets** to version control
- Use Wrangler secrets for production credentials
- Consider adding rate limiting for production use
- Review CORS settings if restricting to specific domains

## Troubleshooting

### "Missing required environment variables"

Ensure you've set all required secrets:
```bash
wrangler secret list
```

If missing, add them:
```bash
wrangler secret put AZURE_OPENAI_KEY
```

### Local development not working

Make sure you have a `.dev.vars` file with valid credentials:
```bash
cat .dev.vars
```

### 403 Forbidden errors from external sites

Some websites have aggressive bot detection. The proxy includes browser-like headers, but some sites may still block automated requests. This is a limitation of the target website's security measures.

## Architecture

```
Frontend (EDS) → Cloudflare Worker → External URLs / Azure OpenAI
                      ↓
                  Secure secrets
                  (env variables)
```

## Related Repositories

- **Frontend**: [LLM-Product-Profiler](../LLM-Product-Profiler) - Adobe EDS site
- **Original**: [gw20251208](../gw20251208) - Original Python-based prototype

## License

Proprietary - Adobe Garage Week 2025

## Support

For questions or issues, see the main project documentation.

