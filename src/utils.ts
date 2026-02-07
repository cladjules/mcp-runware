import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { VercelResponse } from "@vercel/node";

/**
 * Transport storage type
 */
export type TransportStorage = {
  [sessionId: string]: StreamableHTTPServerTransport;
};

/**
 * Creates a new transport storage map
 */
export function createTransportStorage(): TransportStorage {
  return {};
}

/**
 * Creates and configures the MCP server instance
 */
export function createMCPServer(): McpServer {
  return new McpServer(
    {
      name: "mcp-runware",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );
}

/**
 * Creates a StreamableHTTPServerTransport with standard configuration
 */
export function createStreamableTransport(
  onSessionInitialized?: (sessionId: string) => void,
): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: onSessionInitialized,
  });
}

/**
 * Shared API key authentication checker
 */
export function createAuthChecker() {
  const API_KEYS = new Set(
    process.env.MCP_API_KEYS?.split(",").map((key) => key.trim()) || [],
  );

  return {
    apiKeys: API_KEYS,
    /**
     * Checks authentication and sends 401 response if invalid
     * @returns true if authenticated or auth not required, false if unauthorized
     */
    checkAndRespond: (
      apiKey: string | undefined,
      res: Response | VercelResponse,
      clientInfo?: string,
    ): boolean => {
      if (API_KEYS.size === 0) {
        return true; // No auth required if not configured
      }

      if (!apiKey || !API_KEYS.has(apiKey)) {
        console.error(
          `Unauthorized access attempt${clientInfo ? ` from ${clientInfo}` : ""}`,
        );
        res.status(401).json({
          error: "Unauthorized",
          message: "Invalid or missing API key",
        });
        return false;
      }

      return true;
    },
  };
}

/**
 * Creates and sets up a new transport with session storage and cleanup
 */
async function createAndSetupTransport(
  server: McpServer,
  transports: TransportStorage,
): Promise<StreamableHTTPServerTransport> {
  const transport = createStreamableTransport((newSessionId: string) => {
    transports[newSessionId] = transport;
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid && transports[sid]) {
      delete transports[sid];
    }
  };

  await server.connect(transport);
  return transport;
}

/**
 * Handles MCP session management and request routing
 * Shared between HTTP and Vercel transports
 */
export async function handleMCPSession(
  req: any,
  res: any,
  server: McpServer,
  transports: TransportStorage,
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport for this session
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request - create new transport
    transport = await createAndSetupTransport(server, transports);
    await transport.handleRequest(req, res, req.body);
    return;
  } else if (sessionId && !transports[sessionId]) {
    // Session ID provided but not found - likely serverless instance recycling
    console.log("Session not found (serverless), creating new session", {
      oldSessionId: sessionId,
      bodyMethod: req.body?.method,
    });

    transport = await createAndSetupTransport(server, transports);
    await transport.handleRequest(req, res, req.body);
    return;
  } else {
    // No session ID and not an initialization request
    console.error(
      "MCP request error: No session ID provided for non-initialize request",
      {
        bodyMethod: req.body?.method,
        hasBody: !!req.body,
      },
    );
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: Session ID required or send initialize request",
      },
      id: req.body?.id || null,
    });
    return;
  }

  // Handle the request with existing transport
  await transport.handleRequest(req, res, req.body);
}
