# MCP Runware Server

> **✨ Vercel-ready with Fluid compute** | Serverless MCP deployment with streaming support

An MCP (Model Context Protocol) server for AI image generation through Runware's API. Generate images from text using FLUX.1, FLUX.2, HiDream, and more with full control over dimensions, steps, schedulers, and other parameters.

**✨ Fully compatible with Vercel with Fluid compute** - Deploy as a serverless MCP endpoint with streaming support.

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env
# Edit .env and add your RUNWARE_API_KEY

# Build and run
npm run build
npm start
```

**Prerequisites:** Node.js 22+, Runware API key ([get one](https://my.runware.ai/signup))

## Environment Variables

Create a `.env` file in the project root:

```bash
# Required - Your Runware API key
RUNWARE_API_KEY=rwk_abc123xyz456

# Optional - Transport mode (stdio|http|vercel)
# - stdio: Local Claude Desktop (default)
# - http: HTTP server for remote connections
# - vercel: Detection flag for serverless deployment
MCP_TRANSPORT=stdio

# Optional - HTTP server configuration (http mode only)
PORT=3000
HOST=127.0.0.1

# Optional - API key authentication (http/vercel modes)
# Comma-separated list for multiple keys
MCP_API_KEYS=secret-key-1,secret-key-2
```

### Variable Details

- **`RUNWARE_API_KEY`** (required): Get from [Runware Dashboard](https://my.runware.ai/signup) → API Keys. Used to authenticate with Runware's image generation API.

- **`MCP_TRANSPORT`**: Controls how the server communicates with clients:
  - `stdio` - Standard input/output for local Claude Desktop
  - `http` - HTTP server with `/mcp` endpoint for remote access
  - `vercel` - Flag for Vercel serverless deployment (set automatically)

- **`PORT`** / **`HOST`**: HTTP server binding (default: `3000` / `127.0.0.1`). Only used when `MCP_TRANSPORT=http`.

- **`MCP_API_KEYS`**: Security for HTTP/Vercel modes. Without this, the server accepts all requests (dev mode). With keys, clients must send `x-api-key` header. Health checks (`/health`) bypass authentication.

## Usage

### Claude Desktop (Local)

Add to your configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "runware": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-runware/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. The server loads environment variables from `.env` automatically.

### HTTP Server (Remote Access)

```bash
# Start HTTP server
npm run start:http

# Test endpoints
curl http://127.0.0.1:3000/health
curl -X POST http://127.0.0.1:3000/mcp \
  -H "x-api-key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'
```

**Connect from MCP client:**

```typescript
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://127.0.0.1:3000/mcp"),
  { headers: { "x-api-key": "your-key" } },
);
```

### Vercel Deployment (Serverless)

**✨ Fully compatible with Vercel Fluid compute** for streaming MCP responses.

1. **Connect repo to Vercel** - Import your Git repository
2. **Set environment variables** in Vercel dashboard:
   - `MCP_TRANSPORT` - `vercel` (required)
   - `RUNWARE_API_KEY` - Your Runware API key (required)
   - `MCP_API_KEYS` - Authentication keys, comma-separated (recommended)
3. **Deploy** - Vercel auto-detects configuration from `vercel.json` with Fluid enabled

Your MCP server: `https://your-project.vercel.app/mcp`

Connect with same client code as HTTP mode using your Vercel URL. The server leverages Vercel's experimental Fluid compute to support streaming responses required by MCP.

**Important for Vercel:** The server automatically handles serverless instance recycling. When a session is not found (due to instance cold starts or scaling), it creates a new session automatically rather than returning an error. This ensures seamless operation in Vercel's stateless serverless environment.

**Note:** The build process automatically copies model data files from `src/data/` to `dist/data/`. If you update model data with `npm run fetch-models`, remember to rebuild with `npm run build` or `npm run dev` before deploying.

## Testing

### MCP Inspector (Recommended)

Visual testing with [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

OR using HTTP+Streamable

```bash
npm run build
npm run start:http
npm run inspect
```

Opens browser UI at `http://localhost:6274` to test tools interactively. If you see SSE errors, check `.env` has valid `RUNWARE_API_KEY`.

### Command Line

```bash
# List tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js

# Generate image
cat <<EOF | node dist/index.js
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"generate_image","arguments":{"prompt":"Mountain sunset","width":1024,"height":768}}}
EOF
```

## Available Tools

### generate_image

Generate an image from a text prompt.

**Parameters:**

- `prompt` (required): Text description of the image (2-3000 characters)
- `model` (optional): Model ID (default: `runware:101@1` - FLUX.1 Dev)
- `negativePrompt` (optional): What to avoid in the image
- `width` (optional): Width in pixels, divisible by 64 (128-2048, default: 1024)
- `height` (optional): Height in pixels, divisible by 64 (128-2048, default: 1024)
- `steps` (optional): Generation steps (1-100, default: 20)
- `cfgScale` (optional): Guidance scale (0-50, default: 7)
- `scheduler` (optional): Sampling scheduler (e.g., "DPM++ 2M Karras", "Euler A")
- `seed` (optional): Seed for reproducible results
- `numberResults` (optional): Number of images to generate (default: 1)
- `includeCost` (optional): Include cost in response (default: true)

**Example:**

```json
{
  "prompt": "A futuristic city at sunset with flying cars and neon lights",
  "model": "runware:101@1",
  "width": 1024,
  "height": 768,
  "steps": 30,
  "cfgScale": 7
}
```

### get_models

Get a comprehensive list of AI models available on Runware with their AIR identifiers, pricing, and descriptions. Models are automatically sorted by price (cheapest first).

**No parameters required**

**Returns:**

A formatted list of all available models including:

- Model name and AIR identifier
- Pricing information (USD per generation)
- Configuration details (resolution, steps, etc.)
- Discount information where applicable
- Model category and tags

The tool merges data from both popular models and specialized collections, providing up to 44+ unique models sorted by cost-effectiveness.

**Example output:**

- **FLUX.2 [klein] 4B** (`runware:400@4`) - $0.0006 (1024x1024) [Save 40%]
- **Z-Image-Turbo** (`runware:z-image@turbo`) - $0.0006 (1024x1024 · 4 steps)
- **FLUX.2 [klein] 9B** (`runware:400@2`) - $0.00078 (1024x1024 · 4 steps) [Save 87%]
- **Qwen-Image-2512** (`alibaba:qwen-image@2512`) - $0.0051 (1024x1024) [Save 74%]

All pricing and model data is automatically updated when running `npm run fetch-models`.

## Project Structure

```
mcp-runware/
├── src/
│   ├── index.ts              # Main entry point
│   ├── transports.ts         # Transport setup (stdio, HTTP)
│   ├── utils.ts              # Shared utilities (server factory, auth, transport factory)
│   ├── tools.ts              # MCP tool definitions
│   ├── runware-client.ts     # Runware SDK wrapper
│   └── data/                 # Model and pricing data
│       ├── popular_models.json    # Popular models with AIR & pricing
│       ├── best_models.json       # Best text-on-images models
│       └── pricing.json           # Pricing data source
├── scripts/
│   └── fetch_curated_models.py    # Model data fetcher/enricher
├── api/
│   └── index.ts              # Vercel serverless function
├── dist/                     # Compiled JavaScript (generated)
├── vercel.json               # Vercel deployment configuration
├── .env                      # Environment variables (create from .env.example)
├── .env.example              # Environment variables template
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

## Development

### Watch Mode

For active development with auto-recompilation:

```bash
npm run watch
```

In another terminal, run the server:

```bash
node dist/index.js
```

### Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

### Run

Start the MCP server:

```bash
npm start
```

Or build and run in one command:with pricing information, automatically scraped and enriched from Runware. To refresh these lists:

1. **Install Python dependencies** (one-time setup):

   ```bash
   pip3 install requests python-dotenv
   ```

2. **Run the fetch script**:
   ```bash
   npm run fetch-models
   ```

This will:

- Scrape model IDs and names from Runware collection pages
- Fetch AIR identifiers and metadata from the Runware API
- Merge pricing data from `src/data/pricing.json`
- Filter out models without AIR identifiers
- Save enriched data to JSON files in `src/data/`

**Data sources:**

- Popular Models → `src/data/popular_models.json` (manually curated from https://runware.ai/models)
- Best Models → `src/data/best_models.json` (scraped from https://runware.ai/collections/best-for-text-on-images)
- Pricing Data → `src/data/pricing.json` (extracted from https://runware.ai/pricing)

The `get_models` tool automatically merges these sources and sorts by price.

To modify the model collections, edit the `POPULAR_MODELS` and `SCRAPE_COLLECTIONS` arrays API

- Save enriched data to JSON files in `src/data/`

**Collections fetched:**

- Popular Models → `src/data/popular_models.json` (from https://runware.ai/models)
- Best Models → `src/data/best_models.json` (from https://runware.ai/collections/best-for-text-on-images)

To add more collections, edit the `COLLECTIONS` array in `scripts/fetch_curated_models.py`.
