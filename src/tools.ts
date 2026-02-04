import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IRequestImage } from "@runware/sdk-js";
import type { RunwareClient } from "./runware-client.js";

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

  // Register get_popular_models tool
  server.registerTool(
    "get_popular_models",
    {
      description:
        "Get a list of popular AI models available on Runware with their descriptions",
      inputSchema: {},
    },
    async () => {
      const popularModels = [
        {
          id: "runware:400@4",
          name: "FLUX.2 Klein 4B",
          description:
            "Compact and efficient FLUX.2 model optimized for speed and quality balance. Default model.",
        },
        {
          id: "runware:101@1",
          name: "FLUX.1 [dev]",
          description:
            "High-quality FLUX model with excellent compositional understanding and detail preservation.",
        },
        {
          id: "runware:97@2",
          name: "FLUX.1 [schnell]",
          description:
            "Ultra-fast distilled FLUX model for rapid generation (4-8 steps). Very cost-effective.",
        },
        {
          id: "runware:102@1",
          name: "FLUX.2 [dev]",
          description:
            "Next-generation FLUX model with improved quality and speed. Latest version.",
        },
        {
          id: "runware:103@1",
          name: "HiDream-I1 Dev",
          description:
            "Transformer-based model with exceptional text understanding and photorealistic results.",
        },
        {
          id: "civitai:133005@782002",
          name: "Juggernaut XL",
          description:
            "SDXL-based model with excellent photorealism and higher resolution capabilities.",
        },
        {
          id: "civitai:102438@133677",
          name: "Dreamshaper",
          description:
            "SD 1.5 model that excels at artistic and creative imagery.",
        },
      ];

      const modelList = popularModels
        .map((m) => `- **${m.name}** (\`${m.id}\`): ${m.description}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `# Popular Runware Models\n\n${modelList}\n\nYou can find more models at https://my.runware.ai/models/all`,
          },
        ],
      };
    },
  );
}
