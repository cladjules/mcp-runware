import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Express, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import {
  createAuthChecker,
  handleMCPSession,
  createTransportStorage,
} from "./utils.js";

/**
 * Sets up stdio transport for the MCP server
 */
export async function setupStdioTransport(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Runware server running on stdio");
}

/**
 * Sets up HTTP transport with Express app and SSE support
 */
export function setupHttpTransport(
  server: McpServer,
  port: number,
  host: string = "127.0.0.1",
): Express {
  // Create MCP Express app with built-in DNS rebinding protection
  const app = createMcpExpressApp({ host });

  // Map to store transports by session ID
  const transports = createTransportStorage();

  // Use shared auth checker
  const auth = createAuthChecker();

  const requireApiKey = (req: Request, res: Response, next: Function) => {
    // Skip auth for health check
    if (req.path === "/health") {
      next();
      return;
    }

    // Check if API keys are configured
    if (auth.apiKeys.size === 0) {
      console.warn(
        "WARNING: No API keys configured. Set MCP_API_KEYS in .env file.",
      );
      next();
      return;
    }

    const apiKey = req.headers["x-api-key"] as string;

    if (auth.checkAndRespond(apiKey, res, req.ip)) {
      next();
    }
  };

  // Apply authentication to all routes
  app.use(requireApiKey);

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "mcp-runware" });
  });

  // MCP POST endpoint - handles initialization and subsequent requests
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      await handleMCPSession(req, res, server, transports);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error",
          },
          id: null,
        });
      }
    }
  });

  // MCP GET endpoint - handles SSE streaming for resumability
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports[sessionId]) {
      console.error("GET /mcp: Invalid or missing session ID", { sessionId });
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    // Check for Last-Event-ID header for resumability
    const lastEventId = req.headers["last-event-id"] as string | undefined;
    if (lastEventId) {
      console.error(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
      console.error(`Establishing new SSE stream for session ${sessionId}`);
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // MCP DELETE endpoint - handles session termination
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports[sessionId]) {
      res.status(404).send("Session not found");
      return;
    }

    console.error(`Terminating session: ${sessionId}`);

    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling session termination:", error);
      if (!res.headersSent) {
        res.status(500).send("Error processing session termination");
      }
    }
  });

  // Handle server shutdown
  const httpShutdown = async () => {
    console.error("Shutting down HTTP server...");
    // Close all active transports
    for (const sessionId in transports) {
      try {
        console.error(`Closing transport for session ${sessionId}`);
        await transports[sessionId]!.close();
        delete transports[sessionId];
      } catch (error) {
        console.error(
          `Error closing transport for session ${sessionId}:`,
          error,
        );
      }
    }
    process.exit(0);
  };

  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  process.on("SIGINT", httpShutdown);
  process.on("SIGTERM", httpShutdown);

  // Start listening
  app.listen(port, host, () => {
    console.error(`MCP Runware server running on HTTP`);
    console.error(`Streamable HTTP endpoint: http://${host}:${port}/mcp`);
    console.error(`Health check: http://${host}:${port}/health`);
  });

  return app;
}
