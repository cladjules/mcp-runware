import { RunwareClient } from "./src/runware-client.js";
import type { IRequestImage } from "@runware/sdk-js";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Simple test for the new image parameters
 *
 * Before running:
 * 1. Replace TEST_IMAGE_URL with your actual image URL
 * 2. Make sure RUNWARE_API_KEY is set in your .env file
 * 3. Run: npm run test:image-params
 */

async function simpleTest() {
  const apiKey = process.env.RUNWARE_API_KEY;

  if (!apiKey) {
    throw new Error("RUNWARE_API_KEY not found in .env file");
  }

  const client = new RunwareClient({ apiKey });

  console.log("🚀 Testing new image parameters...\n");

  await client.connect();
  console.log("✅ Connected to Runware\n");

  // Test 1: Generate a simple image with basic parameters (no reference images)
  console.log(
    "📸 Test 1: Generate a simple image with basic parameters (no reference images)",
  );
  const simpleRequest: IRequestImage = {
    positivePrompt: "A simple dog",
    model: "runware:400@4",
    width: 512,
    height: 512,
    steps: 8,
    CFGScale: 7,
    numberResults: 1,
    includeCost: true,
  };

  const simpleResult = await client.generateImages(simpleRequest);
  console.log("✅ Success!");
  console.log(`      Image URL: ${simpleResult[0].imageURL}`);
  console.log(`      Cost: $${simpleResult[0].cost}`);
  console.log(`      UUID: ${simpleResult[0].imageUUID}`);
  console.log("");

  // Test 2: referenceImages (style reference)
  console.log("📸 Test 2: Style reference with referenceImages");
  const styleRefRequest: IRequestImage = {
    positivePrompt:
      "The same character with a brown hat or a red hat or a blue hat or glasses or both an hat or glasses",
    model: "runware:400@4",
    width: 512,
    height: 512,
    steps: 8,
    CFGScale: 7,
    referenceImages: [simpleResult[0].imageUUID!], // ⭐ New parameter!
    numberResults: 3,
    includeCost: true,
  };

  const styleRefResult = await client.generateImages(styleRefRequest);
  console.log("✅ Success!");
  for (const [index, img] of styleRefResult.entries()) {
    console.log(`   Result ${index + 1}:`);
    console.log(`      Image URL: ${img.imageURL}`);
    console.log(`      Cost: $${img.cost}`);
  }
  console.log("");

  console.log("🎉 Tests completed!");

  await client.disconnect();
}

simpleTest()
  .then(() => {
    console.log("\n✅ All done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
