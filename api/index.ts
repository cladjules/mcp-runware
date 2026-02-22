import type { VercelRequest, VercelResponse } from "@vercel/node";
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

const handler = (req: VercelRequest, res: VercelResponse) => {
  const apiKey = req.headers["x-api-key"] as string;
  const ip = req.headers["x-forwarded-for"] as string;
  if (checkAuth(apiKey, res, ip)) {
    return mcpHandler(req as any);
  }
};

export default handler;
