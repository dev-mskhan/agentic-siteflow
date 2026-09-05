import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { IStorageService, StorageMetadata, UploadOptions } from "./storage.interface.js";

export class LocalStorageService implements IStorageService {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), "uploads");
  }

  private getFilePath(bucket: string, key: string): string {
    // Sanitize to prevent path traversal
    const safeKey = key.replace(/^(\.\.[/\\])+/, "");
    return path.join(this.baseDir, bucket, safeKey);
  }

  async upload(
    bucket: string,
    key: string,
    content: Buffer | Uint8Array | string,
    _options?: UploadOptions,
  ): Promise<string> {
    const filePath = this.getFilePath(bucket, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return key;
  }

  getDownloadUrl(bucket: string, key: string, _expiresInSeconds = 3600): Promise<string> {
    // For local development, return local file URI or relative endpoint URL
    return Promise.resolve(`/storage/${bucket}/${key}`);
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(bucket, key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const filePath = this.getFilePath(bucket, key);
    return fs.readFile(filePath);
  }

  async delete(bucket: string, key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(bucket, key);
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async getMetadata(bucket: string, key: string): Promise<StorageMetadata | null> {
    try {
      const filePath = this.getFilePath(bucket, key);
      const stat = await fs.stat(filePath);
      const content = await fs.readFile(filePath);
      const checksum = crypto.createHash("sha256").update(content).digest("hex");

      return {
        contentLength: stat.size,
        lastModified: stat.mtime,
        checksum,
      };
    } catch {
      return null;
    }
  }
}
