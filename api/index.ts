import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { checkAPIKey } from "../src/utils.js";
import { registerTools } from "../src/tools.js";
import { RunwareClient } from "../src/runware-client.js";

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

const handler = createMcpHandler(
  (server) => registerTools(server, runwareClient),
  {},
);

const verifyToken = async (
  _: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;

  const isValid = checkAPIKey(bearerToken);
  if (!isValid) return undefined;

  return {
    token: bearerToken,
    scopes: ["write:all"],
    clientId: "mcp-runware-client",
  };
};

// Wrap handler with authorization
const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["write:all"],
});

export { authHandler as GET, authHandler as POST };
