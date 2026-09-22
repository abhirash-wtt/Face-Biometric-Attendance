import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private minio: Minio.Client | null = null;
  private bucket = 'attendance-evidence';
  private provider: string;
  private localDir: string;

  constructor(private readonly config: ConfigService) {
    this.provider = this.config.get<string>('storage.provider') || 'local';
    this.localDir = path.resolve(this.config.get<string>('storage.localDir') || './uploads');
    this.bucket = this.config.get<string>('storage.minio.bucket') || 'attendance-evidence';
  }

  async onModuleInit() {
    fs.mkdirSync(this.localDir, { recursive: true });
    if (this.provider !== 'minio') {
      this.logger.log(`Storage provider: local (${this.localDir})`);
      return;
    }
    try {
      this.minio = new Minio.Client({
        endPoint: this.config.get<string>('storage.minio.endPoint') || 'localhost',
        port: this.config.get<number>('storage.minio.port') || 9000,
        useSSL: !!this.config.get<boolean>('storage.minio.useSSL'),
        accessKey: this.config.get<string>('storage.minio.accessKey') || 'minio',
        secretKey: this.config.get<string>('storage.minio.secretKey') || 'minio123',
      });
      const exists = await this.minio.bucketExists(this.bucket);
      if (!exists) await this.minio.makeBucket(this.bucket);
      this.logger.log('Storage provider: MinIO');
    } catch (err) {
      this.logger.warn(`MinIO unavailable (${(err as Error).message}). Falling back to local disk.`);
      this.minio = null;
      this.provider = 'local';
    }
  }

  async put(buffer: Buffer, contentType = 'image/jpeg', prefix = 'faces'): Promise<string> {
    const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.jpg`;
    if (this.minio && this.provider === 'minio') {
      await this.minio.putObject(this.bucket, key, buffer, buffer.length, {
        'Content-Type': contentType,
      });
    } else {
      const full = path.join(this.localDir, key);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, buffer);
    }
    return `/evidence/${key}`;
  }

  async get(url: string): Promise<Buffer | null> {
    const key = this.objectKey(url);
    if (!key) return null;

    if (url.startsWith('minio://') && this.minio) {
      return this.readMinio(key);
    }

    const full = path.join(this.localDir, key);
    if (fs.existsSync(full)) return fs.readFileSync(full);

    if (this.minio) {
      try {
        return await this.readMinio(key);
      } catch {
        return null;
      }
    }
    return null;
  }

  async remove(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const key = this.objectKey(url);
    if (!key) return;
    try {
      if (this.minio && (this.provider === 'minio' || url.startsWith('minio://'))) {
        await this.minio.removeObject(this.bucket, key);
      }
      const full = path.join(this.localDir, key);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch (err) {
      this.logger.warn(`Failed to remove ${url}: ${(err as Error).message}`);
    }
  }

  private objectKey(url: string): string | null {
    if (url.startsWith('minio://')) {
      return url.replace(`minio://${this.bucket}/`, '');
    }
    if (url.startsWith('/evidence/')) {
      return url.replace('/evidence/', '');
    }
    return null;
  }

  private async readMinio(key: string): Promise<Buffer> {
    if (!this.minio) throw new Error('MinIO unavailable');
    const stream = await this.minio.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  async deleteOlderThan(days: number): Promise<number> {
    const cutoff = Date.now() - days * 86400_000;
    let removed = 0;
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else {
          const st = fs.statSync(p);
          if (st.mtimeMs < cutoff) {
            fs.unlinkSync(p);
            removed += 1;
          }
        }
      }
    };
    walk(this.localDir);
    return removed;
  }
}
