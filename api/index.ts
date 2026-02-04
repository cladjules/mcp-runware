/**
 * Vercel API Route for MCP Server
 * Uses the standard StreamableHTTPServerTransport with in-memory session storage
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { RunwareClient } from "../src/runware-client.js";
import {
  createMCPServer,
  createAuthChecker,
  handleMCPSession,
  createTransportStorage,
} from "../src/utils.js";
import { registerTools } from "../src/tools.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Get API key from environment variable
const RUNWARE_API_KEY = process.env.RUNWARE_API_KEY;

// Initialize Runware client (singleton) - only if API key exists
let runwareClient: RunwareClient | null = null;
let server: McpServer | null = null;

if (RUNWARE_API_KEY) {
  runwareClient = new RunwareClient({
    apiKey: RUNWARE_API_KEY,
  });

  // Create MCP server (singleton)
  server = createMCPServer();
  registerTools(server, runwareClient);
}

// Map to store transports by session ID
const transports = createTransportStorage();

// Create auth checker (singleton)
const auth = createAuthChecker();

// Export the handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Handle all GET requests as health checks
    if (req.method === "GET") {
      res.status(200).json({ status: "ok", server: "mcp-runware" });
      return;
    }

    // From here on, only POST requests
    // Check if server is initialized
    if (!RUNWARE_API_KEY || !server || !runwareClient) {
      res.status(500).json({
        error: "Server not initialized",
        message: "RUNWARE_API_KEY environment variable is required",
      });
      return;
    }

    // Check authentication
    const apiKey = req.headers["x-api-key"] as string;
    const clientInfo = (req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress) as string;
    if (!auth.checkAndRespond(apiKey, res, clientInfo)) {
      return;
    }

    // Check if request has a body
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error("POST request with empty body");
      res.status(400).json({
        error: "Bad Request",
        message: "Request body is required for MCP protocol",
      });
      return;
    }

    // Handle MCP request with session management
    await handleMCPSession(req, res, server, transports);
  } catch (error) {
    console.error("Handler error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
