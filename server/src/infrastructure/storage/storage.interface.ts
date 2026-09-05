export interface StorageMetadata {
  contentLength?: number;
  contentType?: string;
  checksum?: string;
  lastModified?: Date;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface IStorageService {
  /**
   * Uploads file content (Buffer or stream) to object storage.
   * Returns storage key/path.
   */
  upload(
    bucket: string,
    key: string,
    content: Buffer | Uint8Array | string,
    options?: UploadOptions,
  ): Promise<string>;

  /**
   * Generates a signed/public download URL or direct access path for the stored object.
   */
  getDownloadUrl(bucket: string, key: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Checks if an object exists at the given bucket and key.
   */
  exists(bucket: string, key: string): Promise<boolean>;

  /**
   * Retrieves object content as Buffer.
   */
  download(bucket: string, key: string): Promise<Buffer>;

  /**
   * Deletes an object from storage.
   */
  delete(bucket: string, key: string): Promise<void>;

  /**
   * Gets object metadata (size, content type, hash).
   */
  getMetadata(bucket: string, key: string): Promise<StorageMetadata | null>;
}
