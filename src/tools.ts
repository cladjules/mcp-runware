import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RunwareClient } from "./runware-client.js";
import { handleGenerateImage, handleGetModels } from "./handlers.js";

/**
 * Registers all available tools with the MCP server
 */
export function registerTools(
  server: McpServer,
  runwareClient: RunwareClient,
): void {
  // Register generate_image tool
  server.registerTool(
    "generate_image",
    {
      description:
        "Generate an image from a text prompt using Runware AI. Supports various models, dimensions, and generation parameters.",
      inputSchema: {
        prompt: z
          .string()
          .describe(
            "The text prompt describing the image to generate (2-3000 characters)",
          ),
        model: z
          .string()
          .optional()
          .describe(
            "The model to use for generation (default: runware:400@4 - FLUX.2 Klein 4B). Examples: runware:101@1 (FLUX.1 Dev), civitai:102438@133677 (Dreamshaper), civitai:133005@782002 (Juggernaut XL)",
          ),
        negativePrompt: z
          .string()
          .optional()
          .describe("What to avoid in the generated image (optional)"),
        width: z
          .number()
          .optional()
          .describe(
            "Image width in pixels (must be divisible by 64, between 128-2048). Default: 1024",
          ),
        height: z
          .number()
          .optional()
          .describe(
            "Image height in pixels (must be divisible by 64, between 128-2048). Default: 1024",
          ),
        steps: z
          .number()
          .optional()
          .describe(
            "Number of generation steps (1-100). Higher = more detailed but slower. Default: 4",
          ),
        cfgScale: z
          .number()
          .optional()
          .describe(
            "Guidance scale (0-50). Higher = closer to prompt. Default: 1",
          ),
        scheduler: z
          .string()
          .optional()
          .describe(
            'The sampling scheduler to use. Examples: "DPM++ 2M Karras", "Euler A", "UniPC"',
          ),
        seed: z
          .number()
          .optional()
          .describe(
            "Seed for reproducible results (optional). Use the same seed to generate the same image.",
          ),
        seedImage: z
          .string()
          .optional()
          .describe(
            "URL or UUID of an image to use as a seed for image-to-image generation (optional)",
          ),
        maskImage: z
          .string()
          .optional()
          .describe(
            "URL or UUID of a mask image for inpainting/editing specific areas (optional)",
          ),
        referenceImages: z
          .array(z.string())
          .optional()
          .describe(
            "Array of image URLs or UUIDs to use as style/content references (optional)",
          ),
        numberResults: z
          .number()
          .optional()
          .describe("Number of images to generate. Default: 1"),
        includeCost: z
          .boolean()
          .optional()
          .describe("Include cost information in the response. Default: true"),
      },
      outputSchema: {
        images: z.array(
          z.object({
            imageURL: z.string().optional(),
            imageUUID: z.string().optional(),
            cost: z.number().optional(),
          }),
        ),
      },
    },
    async (args: {
      [key: string]: string[] | string | number | boolean | undefined;
    }) => handleGenerateImage(runwareClient, args),
  );

  // Register get_models tool
  server.registerTool(
    "get_models",
    {
      description:
        "Get a comprehensive list of AI models available on Runware with their AIR identifiers, pricing, and descriptions. Models are sorted by price (cheapest first).",
      inputSchema: {},
    },
    async () => handleGetModels(),
  );
}
