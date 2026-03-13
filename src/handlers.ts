import type { IRequestImage } from "@runware/sdk-js";
import type { RunwareClient } from "./runware-client.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Handler for the generate_image tool
 */
export async function handleGenerateImage(
  runwareClient: RunwareClient,
  args: {
    [key: string]: string[] | string | number | boolean | undefined;
  },
) {
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
    seedImage: args.seedImage as string | undefined,
    maskImage: args.maskImage as string | undefined,
    referenceImages: args.referenceImages as string[] | undefined,
  };

  // Generate image
  try {
    const images = await runwareClient.generateImages(request);
    if (!images || images.length === 0) {
      throw new Error("Image generation failed: No images returned");
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(images) }],
      structuredContent: {
        images,
      },
    };
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
}

/**
 * Handler for the get_models tool
 */
export async function handleGetModels() {
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
          type: "text" as const,
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
}
