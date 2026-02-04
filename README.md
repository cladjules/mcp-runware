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

### get_popular_models

Get a list of popular AI models available on Runware with descriptions.

**No parameters required**

**Returns:**

A formatted list of popular models including:

- **FLUX.1 [dev]** (`runware:101@1`) - High-quality FLUX model with excellent detail
- **FLUX.1 [schnell]** (`runware:97@2`) - Ultra-fast distilled FLUX (4-8 steps)
- **FLUX.2 [dev]** (`runware:102@1`) - Next-generation FLUX with improved quality
- **HiDream-I1 Dev** (`runware:103@1`) - Transformer-based with exceptional photorealism
- **Juggernaut XL** (`civitai:133005@782002`) - SDXL-based photorealistic model
- **Dreamshaper** (`civitai:102438@133677`) - SD 1.5 artistic model

Find more models at: https://my.runware.ai/models/all

## Project Structure

```
mcp-runware/
├── src/
│   ├── index.ts              # Main entry point
│   ├── transports.ts         # Transport setup (stdio, HTTP)
│   ├── utils.ts              # Shared utilities (server factory, auth, transport factory)
│   ├── tools.ts              # MCP tool definitions
│   ├── runware-client.ts     # Runware SDK wrapper
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

Or build and run in one command:

```bash
npm run dev
```
