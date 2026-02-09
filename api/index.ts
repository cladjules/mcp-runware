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

if (RUNWARE_API_KEY) {
  runwareClient = new RunwareClient({
    apiKey: RUNWARE_API_KEY,
  });
}

// Map to store transports AND servers by session ID
// In serverless mode, each session needs its own server instance
const transports = createTransportStorage();
const servers: { [sessionId: string]: McpServer } = {};

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
    if (!RUNWARE_API_KEY || !runwareClient) {
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
    // In serverless mode, create/retrieve server per session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    let server: McpServer;
    if (sessionId && servers[sessionId]) {
      // Reuse existing server for this session
      server = servers[sessionId];
    } else {
      // Create new server for new session
      server = createMCPServer();
      registerTools(server, runwareClient);

      // Store server if this will create a session
      if (sessionId) {
        servers[sessionId] = server;
      }
    }

    // Clean up server when session closes
    const onSessionClose = (closedSessionId: string) => {
      console.log("Cleaning up server for session:", closedSessionId);
      if (servers[closedSessionId]) {
        delete servers[closedSessionId];
      }
    };

    await handleMCPSession(req, res, server, transports, onSessionClose);
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
