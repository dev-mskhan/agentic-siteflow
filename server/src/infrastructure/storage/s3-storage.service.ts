import * as Minio from "minio";
import type { IStorageService, StorageMetadata, UploadOptions } from "./storage.interface.js";

export interface S3StorageConfig {
  endPoint: string;
  port?: number;
  useSSL?: boolean;
  accessKey: string;
  secretKey: string;
  region?: string;
}

export class S3StorageService implements IStorageService {
  private client: Minio.Client;

  constructor(config: S3StorageConfig) {
    this.client = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL ?? false,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region,
    });
  }

  async upload(
    bucket: string,
    key: string,
    content: Buffer | Uint8Array | string,
    options?: UploadOptions,
  ): Promise<string> {
    const buffer = Buffer.isBuffer(content)
      ? content
      : typeof content === "string"
        ? Buffer.from(content, "utf-8")
        : Buffer.from(content);

    const meta: Record<string, string> = {
      ...(options?.metadata || {}),
    };
    if (options?.contentType) {
      meta["Content-Type"] = options.contentType;
    }

    await this.client.putObject(bucket, key, buffer, buffer.length, meta);
    return key;
  }

  async getDownloadUrl(bucket: string, key: string, expiresInSeconds = 3600): Promise<string> {
    return await this.client.presignedGetObject(bucket, key, expiresInSeconds);
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const stream = await this.client.getObject(bucket, key);
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on("data", (chunk: Buffer | Uint8Array) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", (err: unknown) =>
        reject(err instanceof Error ? err : new Error(String(err))),
      );
    });
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.removeObject(bucket, key);
  }

  async getMetadata(bucket: string, key: string): Promise<StorageMetadata | null> {
    try {
      const stat = await this.client.statObject(bucket, key);
      return {
        contentLength: stat.size,
        contentType: (stat.metaData?.["content-type"] as string) ?? undefined,
        checksum: stat.etag,
        lastModified: stat.lastModified,
      };
    } catch {
      return null;
    }
  }
}
