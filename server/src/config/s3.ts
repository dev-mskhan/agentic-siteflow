import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from './env';

export interface ObjectStorage {
  putObject(input: { key: string; body: Buffer | Uint8Array; contentType?: string }): Promise<void>;
  getObject(input: { key: string }): Promise<Buffer>;
  deleteObject(input: { key: string }): Promise<void>;
  objectExists(input: { key: string }): Promise<boolean>;
  getSignedDownloadUrl(input: { key: string; expiresInSeconds?: number }): Promise<string>;
  check(): Promise<void>;
}

export function orgScopedKey(organizationId: string, ...parts: string[]): string {
  return ['org', organizationId, ...parts].join('/');
}

export function projectScopedKey(
  organizationId: string,
  projectId: string,
  ...parts: string[]
): string {
  return orgScopedKey(organizationId, 'projects', projectId, ...parts);
}

export function createObjectStorage(env: Env): ObjectStorage {
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });
  const bucket = env.S3_BUCKET;

  return {
    async putObject({ key, body, contentType }) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async getObject({ key }) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const chunk = await result.Body?.transformToByteArray();
      return Buffer.from(chunk ?? []);
    },
    async deleteObject({ key }) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async objectExists({ key }) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
    async getSignedDownloadUrl({ key, expiresInSeconds = 3600 }) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      });
    },
    async check() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
  };
}
