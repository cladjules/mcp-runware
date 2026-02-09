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
 * Creates and configures a new transport with cleanup handlers
 * Reduces code duplication for transport setup
 */
async function createAndSetupTransport(
  server: McpServer,
  transports: TransportStorage,
  sessionId?: string,
  onClose?: (sessionId: string) => void,
): Promise<StreamableHTTPServerTransport> {
  console.log("createAndSetupTransport: Starting transport creation", {
    sessionId,
  });

  const transport = createStreamableTransport((newSessionId: string) => {
    console.log("Transport session initialized:", {
      newSessionId,
      forcedSessionId: sessionId,
    });
    transports[newSessionId] = transport;
  });

  // Set up onclose handler to clean up transport
  transport.onclose = () => {
    const sid = transport.sessionId;
    console.log("Transport closing:", { sessionId: sid });
    if (sid && transports[sid]) {
      delete transports[sid];
      // Call cleanup callback if provided
      if (onClose) {
        onClose(sid);
      }
    }
  };

  // If a specific session ID is requested, force it (for serverless recovery)
  if (sessionId) {
    console.log("createAndSetupTransport: Forcing session ID", { sessionId });
    (transport as any)._sessionId = sessionId;
    transports[sessionId] = transport;
  }

  // Connect transport to the shared server instance
  // StreamableHTTPServerTransport internally creates a new Protocol instance per connection
  // so multiple transports CAN connect to the same server
  console.log("createAndSetupTransport: Connecting transport to server");
  await server.connect(transport);
  console.log("createAndSetupTransport: Transport connected successfully");

  return transport;
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
 * Handles MCP session management and request routing
 * Shared between HTTP and Vercel transports
 */
export async function handleMCPSession(
  req: any,
  res: any,
  server: McpServer,
  transports: TransportStorage,
  onSessionClose?: (sessionId: string) => void,
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const method = req.body?.method;

  // Log all incoming requests for debugging
  console.log("MCP request received:", {
    sessionId,
    method,
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    headers: {
      "content-type": req.headers["content-type"],
      "mcp-session-id": sessionId,
    },
  });

  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport for this session
    console.log(`Reusing existing session: ${sessionId}`);
    transport = transports[sessionId];
  } else if (isInitializeRequest(req.body)) {
    // Initialize request - create new transport (with or without session ID)
    if (sessionId) {
      console.log(
        `Creating new session with requested ID: ${sessionId} (serverless recovery)`,
      );
      // Client wants to recreate session with specific ID (serverless recovery)
      transport = await createAndSetupTransport(
        server,
        transports,
        sessionId,
        onSessionClose,
      );
    } else {
      console.log("Creating new session (initialize request)");
      transport = await createAndSetupTransport(
        server,
        transports,
        undefined,
        onSessionClose,
      );
    }
  } else if (sessionId && !transports[sessionId]) {
    // Session ID provided but not found - likely expired or instance recycled
    // Client needs to send initialize request to recreate
    console.error("404 Session not found (expired or instance recycled)", {
      requestedSessionId: sessionId,
      bodyMethod: method,
      availableSessions: Object.keys(transports),
    });
    res.status(404).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message:
          "Session not found. Please send an initialize request with the same mcp-session-id header.",
      },
      id: req.body?.id || null,
    });
    return;
  } else {
    // No session ID and not an initialization request
    console.error(
      "400 Bad Request: No session ID provided for non-initialize request",
      {
        bodyMethod: method,
        hasBody: !!req.body,
        isInitializeRequest: isInitializeRequest(req.body),
        sessionId,
        body: req.body,
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
  console.log(`Handling request with transport, method: ${method}`);

  try {
    await transport.handleRequest(req, res, req.body);
    console.log(`Request completed successfully, method: ${method}`);
  } catch (error) {
    console.error("Error in transport.handleRequest:", {
      method,
      sessionId,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error processing request",
        },
        id: req.body?.id || null,
      });
    }
  }
}
