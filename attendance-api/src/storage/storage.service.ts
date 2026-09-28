import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';

/** Every key written by put(): `<prefix>/<yyyy-mm-dd>/<uuid>.jpg`. Anything else is rejected. */
const EVIDENCE_KEY = /^[a-z0-9_-]+\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
export const EVIDENCE_URL_TTL_SEC = 60 * 60;

export function isSafeEvidenceKey(key: string): boolean {
  return EVIDENCE_KEY.test(key);
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private minio: Minio.Client | null = null;
  private bucket = 'attendance-evidence';
  private provider: string;
  private localDir: string;
  private readonly signingKey: Buffer;

  constructor(private readonly config: ConfigService) {
    this.provider = this.config.get<string>('storage.provider') || 'local';
    this.localDir = path.resolve(this.config.get<string>('storage.localDir') || './uploads');
    this.bucket = this.config.get<string>('storage.minio.bucket') || 'attendance-evidence';
    this.signingKey = createHash('sha256')
      .update(`evidence-url:${this.config.get<string>('jwt.accessSecret') || ''}`)
      .digest();
  }

  /**
   * Face images are shown with plain <img>/<Image> tags that cannot send a bearer token,
   * so callers that already authorised the viewer hand out a short-lived signed link.
   */
  signUrl(url: string | null | undefined, ttlSec = EVIDENCE_URL_TTL_SEC): string | null {
    if (!url) return null;
    const key = this.objectKey(url);
    if (!key || !url.startsWith('/evidence/')) return null;
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    return `/evidence/${key}?exp=${exp}&sig=${this.signature(key, exp)}`;
  }

  verifySignedKey(key: string, exp: unknown, sig: unknown): boolean {
    if (!isSafeEvidenceKey(key) || typeof exp !== 'string' || typeof sig !== 'string') return false;
    if (!/^\d{1,12}$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return false;
    const expected = Buffer.from(this.signature(key, Number(exp)));
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private signature(key: string, exp: number): string {
    return createHmac('sha256', this.signingKey).update(`${key}\n${exp}`).digest('base64url');
  }

  private localPath(key: string): string | null {
    const full = path.resolve(this.localDir, key);
    return full.startsWith(this.localDir + path.sep) ? full : null;
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

    const full = this.localPath(key);
    if (full && fs.existsSync(full)) return fs.readFileSync(full);

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
      const full = this.localPath(key);
      if (full && fs.existsSync(full)) fs.unlinkSync(full);
    } catch (err) {
      this.logger.warn(`Failed to remove ${url}: ${(err as Error).message}`);
    }
  }

  private objectKey(url: string): string | null {
    let key: string | null = null;
    if (url.startsWith(`minio://${this.bucket}/`)) {
      key = url.slice(`minio://${this.bucket}/`.length);
    } else if (url.startsWith('/evidence/')) {
      key = url.slice('/evidence/'.length);
    }
    return key && isSafeEvidenceKey(key) ? key : null;
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
