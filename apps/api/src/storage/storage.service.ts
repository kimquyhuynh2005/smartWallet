import { Global, HttpException, Injectable, Module } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadTicket {
  url: string;
  fields: Record<string, string>;
}

/** Private-bucket storage. Receipts are never public: uploads use a size-capped POST policy, reads use short-lived signed URLs. */
export abstract class StorageService {
  abstract isConfigured(): boolean;
  abstract createUploadTicket(key: string, contentType: string, maxBytes: number, expiresInSec: number): Promise<UploadTicket>;
  abstract getDownloadUrl(key: string, expiresInSec?: number): Promise<string | null>;
}

@Injectable()
export class S3StorageService extends StorageService {
  private client = new S3Client({
    region: process.env.S3_REGION ?? 'ap-southeast-1',
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
      : {}),
  });
  private bucket = process.env.S3_BUCKET!;

  isConfigured() {
    return true;
  }

  async createUploadTicket(key: string, contentType: string, maxBytes: number, expiresInSec: number) {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresInSec,
      Fields: { 'Content-Type': contentType },
      // S3 itself rejects oversize files and mismatching content types
      Conditions: [['content-length-range', 1, maxBytes], ['eq', '$Content-Type', contentType]],
    });
    return { url, fields };
  }

  getDownloadUrl(key: string, expiresInSec = 300) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSec });
  }
}

@Injectable()
export class UnconfiguredStorageService extends StorageService {
  isConfigured() {
    return false;
  }
  async createUploadTicket(): Promise<UploadTicket> {
    throw new HttpException({ code: 'STORAGE_NOT_CONFIGURED', message: 'Receipt storage (S3_BUCKET) is not configured' }, 501);
  }
  async getDownloadUrl() {
    return null;
  }
}

@Global()
@Module({
  providers: [{ provide: StorageService, useFactory: () => (process.env.S3_BUCKET ? new S3StorageService() : new UnconfiguredStorageService()) }],
  exports: [StorageService],
})
export class StorageModule {}
