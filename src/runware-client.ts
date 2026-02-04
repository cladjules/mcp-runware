import {
  Runware,
  type IRequestImage,
  type ITextToImage,
} from "@runware/sdk-js";

export interface RunwareConfig {
  apiKey: string;
}

export type ImageInferenceResponse = Array<{
  imageUUID?: string;
  imageURL?: string;
  cost?: number;
}>;

export class RunwareClient {
  private runware: InstanceType<typeof Runware>;
  private connected = false;

  constructor(config: RunwareConfig) {
    this.runware = new Runware({
      apiKey: config.apiKey,
      shouldReconnect: true,
      globalMaxRetries: 3,
      timeoutDuration: 120000, // 2 minutes
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.runware.ensureConnection();
      this.connected = true;
      console.error("[Runware] Connected successfully");
    }
  }

  async generateImages(params: IRequestImage): Promise<ImageInferenceResponse> {
    if (!this.connected) {
      await this.connect();
    }

    const images: ITextToImage[] | undefined =
      await this.runware.requestImages(params);

    console.log("Generated images:", images);

    if (!images || images.length === 0) {
      throw new Error("No images generated");
    }

    return images.map((img) => ({
      imageUUID: img.imageUUID,
      imageURL: img.imageURL,
      cost: img.cost,
    }));
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.runware.disconnect();
      this.connected = false;
      console.error("[Runware] Disconnected");
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
