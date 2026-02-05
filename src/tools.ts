import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IRequestImage } from "@runware/sdk-js";
import type { RunwareClient } from "./runware-client.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    async (args: { [key: string]: string | number | boolean | undefined }) => {
      // Ensure client is connected
      if (!runwareClient.isConnected()) {
        await runwareClient.connect();
      }

      // Validate inputs
      const prompt = args.prompt as string;
      if (!prompt || prompt.length < 2 || prompt.length > 3000) {
        throw new Error("Prompt must be between 2 and 3000 characters");
      }

      const width = (args.width as number) || 1024;
      const height = (args.height as number) || 1024;

      if (width < 128 || width > 2048 || width % 64 !== 0) {
        throw new Error("Width must be between 128-2048 and divisible by 64");
      }

      if (height < 128 || height > 2048 || height % 64 !== 0) {
        throw new Error("Height must be between 128-2048 and divisible by 64");
      }

      // Build complete request parameters
      const request: IRequestImage = {
        positivePrompt: prompt,
        model: (args.model as string) || "runware:400@4",
        width,
        height,
        steps: (args.steps as number) || 4,
        CFGScale: (args.cfgScale as number) || 1,
        numberResults: (args.numberResults as number) || 1,
        includeCost: args.includeCost !== false,
        negativePrompt: args.negativePrompt as string | undefined,
        scheduler: args.scheduler as string | undefined,
        seed: args.seed as number | undefined,
      };

      // Generate image
      try {
        const images = await runwareClient.generateImages(request);
        if (!images || images.length === 0) {
          throw new Error("Image generation failed: No images returned");
        }

        return {
          content: [{ type: "text", text: JSON.stringify(images) }],
          structuredContent: {
            images,
          },
        };
      } catch (error) {
        console.error("Error generating image:", error);
        throw error;
      }
    },
  );

  // Register get_models tool
  server.registerTool(
    "get_models",
    {
      description:
        "Get a comprehensive list of AI models available on Runware with their AIR identifiers, pricing, and descriptions. Models are sorted by price (cheapest first).",
      inputSchema: {},
    },
    async () => {
      try {
        // Load model data from JSON files
        const popularPath = join(__dirname, "data", "popular_models.json");
        const bestPath = join(__dirname, "data", "best_models.json");

        const popularData = JSON.parse(readFileSync(popularPath, "utf-8"));
        const bestData = JSON.parse(readFileSync(bestPath, "utf-8"));

        // Merge models from both files
        const allModels = [
          ...popularData.models.map((m: any) => ({
            ...m,
            collection: "Popular Models",
          })),
          ...bestData.models.map((m: any) => ({
            ...m,
            collection: "Best for Text on Images",
          })),
        ];

        // Remove duplicates based on AIR identifier
        const uniqueModels = Array.from(
          new Map(allModels.map((m) => [m.air, m])).values(),
        );

        // Sort by price (cheapest first, models without price at the end)
        uniqueModels.sort((a, b) => {
          if (a.price_usd && b.price_usd) {
            return a.price_usd - b.price_usd;
          }
          if (a.price_usd) return -1;
          if (b.price_usd) return 1;
          return 0;
        });

        // Format models for output
        const formattedModels = uniqueModels
          .map((m) => {
            let line = `- **${m.name}** (\`${m.air}\`)`;

            if (m.price_usd) {
              line += ` - $${m.price_usd}`;
              if (m.price_configuration) {
                line += ` (${m.price_configuration})`;
              }
              if (m.price_discount) {
                line += ` [${m.price_discount}]`;
              }
            }

            if (m.category) {
              line += `\n  - Type: ${m.category}`;
            }

            if (m.tags && m.tags.length > 0) {
              line += `\n  - Tags: ${m.tags.slice(0, 5).join(", ")}`;
            }

            return line;
          })
          .join("\n\n");

        const header = `# Available Runware Models (${uniqueModels.length} models)

Sorted by price (cheapest first). Prices may vary based on configuration.

`;

        return {
          content: [
            {
              type: "text",
              text: header + formattedModels,
            },
          ],
          structuredContent: {
            total_models: uniqueModels.length,
            models: uniqueModels,
          },
        };
      } catch (error) {
        console.error("Error loading model data:", error);
        throw new Error(
          "Failed to load model data. Make sure to run 'npm run fetch-models' first.",
        );
      }
    },
  );
}
