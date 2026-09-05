import { env } from "../../config/index.js";
import type { IStorageService } from "./storage.interface.js";
import { LocalStorageService } from "./local-storage.service.js";
import { S3StorageService } from "./s3-storage.service.js";

// Storage provider selection based on environment configuration
export const storageService: IStorageService =
  env.STORAGE_PROVIDER === "s3"
    ? new S3StorageService({
        endPoint: env.S3_ENDPOINT,
        port: env.S3_PORT,
        useSSL: env.S3_USE_SSL,
        accessKey: env.S3_ACCESS_KEY,
        secretKey: env.S3_SECRET_KEY,
      })
    : new LocalStorageService();

export * from "./storage.interface.js";
export * from "./local-storage.service.js";
export * from "./s3-storage.service.js";

