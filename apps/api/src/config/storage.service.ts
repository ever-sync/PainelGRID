import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | undefined;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('STORAGE_ENDPOINT');
    const region = this.config.get<string>('STORAGE_REGION');
    const accessKeyId = this.config.get<string>('STORAGE_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('STORAGE_SECRET_ACCESS_KEY');
    this.bucket = this.config.get<string>('STORAGE_BUCKET');

    if (endpoint && region && accessKeyId && secretAccessKey && this.bucket) {
      this.client = new S3Client({
        endpoint,
        region,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: false,
      });
    } else {
      this.client = null;
      this.logger.warn(
        'Storage nao configurado (STORAGE_* ausentes) - upload/cache de midia desativado.',
      );
    }
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (err) {
      this.logger.warn(`Falha ao subir objeto '${key}' no storage: ${(err as Error).message}`);
    }
  }

  async download(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        buffer: Buffer.from(bytes),
        contentType: result.ContentType ?? 'application/octet-stream',
      };
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      this.logger.warn(`Falha ao baixar objeto '${key}' do storage: ${(err as Error).message}`);
      return null;
    }
  }
}
