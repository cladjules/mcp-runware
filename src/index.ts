#!/usr/bin/env node

import dotenv from "dotenv";
import { RunwareClient } from "./runware-client.js";
import { setupHttpTransport, setupStdioTransport } from "./transports.js";
import { createMCPServer } from "./utils.js";
import { registerTools } from "./tools.js";

// Load environment variables from .env file (suppress output for stdio mode)
dotenv.config({ debug: false });

// Get API key from environment variable
const RUNWARE_API_KEY = process.env.RUNWARE_API_KEY;

if (!RUNWARE_API_KEY) {
  console.error("Error: RUNWARE_API_KEY environment variable is required");
  process.exit(1);
}

// Initialize Runware client
const runwareClient = new RunwareClient({
  apiKey: RUNWARE_API_KEY,
});

// Create MCP server
const server = createMCPServer();

// Register all tools
registerTools(server, runwareClient);

// Handle process cleanup
async function cleanup() {
  await runwareClient.disconnect();
  await server.close();
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

// Start server with appropriate transport
async function main() {
  const transportMode = process.env.MCP_TRANSPORT || "stdio";

  if (transportMode === "vercel") {
    // Vercel serverless mode - export handler instead of starting server
    console.error(
      "Vercel mode detected - use api/index.ts for serverless deployment",
    );
    return;
  }

  if (transportMode === "http") {
    // HTTP Streamable transport mode
    const PORT = parseInt(process.env.PORT || "3000", 10);
    const HOST = process.env.HOST || "127.0.0.1";
    setupHttpTransport(server, PORT, HOST);
  } else {
    // Default stdio transport mode
    try {
      await setupStdioTransport(server);
    } catch (error) {
      console.error("Failed to start server:", error);
      throw error;
    }
  }
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
