import type { Request, Response } from "express";
import { createMcpHandler } from "mcp-handler";
import { checkAuth } from "../src/utils.js";
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

const mcpHandler = createMcpHandler((server) =>
  registerTools(server, runwareClient),
);

const handler = (req: Request, res: Response) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (checkAuth(apiKey, res, req.ip)) {
    return mcpHandler(req as any);
  }
};

export { handler as GET, handler as POST };
