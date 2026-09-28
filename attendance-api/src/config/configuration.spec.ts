import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertProductionConfig, assertSecretsConfigured, secret } from './configuration';
import { isGitLfsPointer } from '../recognition/embeddings.service';

const secureEnv = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  DATABASE_PASSWORD: 'strong-db-password',
  ADMIN_PASSWORD: 'Str0ng!Admin',
  DEVICE_BOOTSTRAP_SECRET: 'random-bind-secret',
  SMTP_HOST: 'smtp.example.com',
  STORAGE_PROVIDER: 'minio',
  MINIO_ACCESS_KEY: 'attendance',
  MINIO_SECRET_KEY: 'strong-minio-password',
};

describe('assertProductionConfig', () => {
  it('ignores non-production environments', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'local' })).not.toThrow();
  });

  it('accepts a fully configured production environment', () => {
    expect(() => assertProductionConfig(secureEnv)).not.toThrow();
  });

  it('rejects the placeholder secrets from .env.example', () => {
    expect(() =>
      assertProductionConfig({
        ...secureEnv,
        JWT_ACCESS_SECRET: 'change-me-access-secret-local',
        ADMIN_PASSWORD: 'Admin@123',
        MINIO_SECRET_KEY: 'minio123',
      }),
    ).toThrow(/JWT_ACCESS_SECRET, ADMIN_PASSWORD, MINIO_SECRET_KEY/);
  });

  it('rejects reusing the access secret for refresh tokens', () => {
    expect(() =>
      assertProductionConfig({ ...secureEnv, JWT_REFRESH_SECRET: secureEnv.JWT_ACCESS_SECRET }),
    ).toThrow(/must differ/);
  });

  it('does not require MinIO keys when storing on local disk', () => {
    const { MINIO_ACCESS_KEY, MINIO_SECRET_KEY, ...rest } = secureEnv;
    expect(() => assertProductionConfig({ ...rest, STORAGE_PROVIDER: 'local' })).not.toThrow();
  });

  it('rejects secrets that were once committed to the repository', () => {
    expect(() =>
      assertProductionConfig({
        ...secureEnv,
        DATABASE_PASSWORD: 'app',
        DEVICE_BOOTSTRAP_SECRET: 'bind-device-once',
      }),
    ).toThrow(/DATABASE_PASSWORD, DEVICE_BOOTSTRAP_SECRET/);
  });
});

describe('assertSecretsConfigured', () => {
  const localEnv = {
    NODE_ENV: 'local',
    JWT_ACCESS_SECRET: 'local-access',
    JWT_REFRESH_SECRET: 'local-refresh',
    DATABASE_PASSWORD: 'local-db',
    DEVICE_BOOTSTRAP_SECRET: 'local-bind',
  };

  it('accepts a local environment with every required secret', () => {
    expect(() => assertSecretsConfigured(localEnv)).not.toThrow();
  });

  it('requires secrets outside production too', () => {
    const { JWT_ACCESS_SECRET, DEVICE_BOOTSTRAP_SECRET, ...rest } = localEnv;
    expect(() => assertSecretsConfigured(rest)).toThrow(
      /Missing required secrets: JWT_ACCESS_SECRET, DEVICE_BOOTSTRAP_SECRET/,
    );
  });

  it('treats .env.example placeholders as missing', () => {
    expect(() =>
      assertSecretsConfigured({ ...localEnv, DATABASE_PASSWORD: '<database-password>' }),
    ).toThrow(/DATABASE_PASSWORD/);
  });

  it('requires MinIO keys only when MinIO storage is enabled', () => {
    expect(() => assertSecretsConfigured({ ...localEnv, STORAGE_PROVIDER: 'minio' })).toThrow(
      /MINIO_ACCESS_KEY, MINIO_SECRET_KEY/,
    );
  });
});

describe('secret', () => {
  it('returns undefined for empty and placeholder values', () => {
    expect(secret('A', { A: '' })).toBeUndefined();
    expect(secret('A', { A: '<smtp-password>' })).toBeUndefined();
    expect(secret('A', { A: ' real ' })).toBe('real');
  });
});

describe('isGitLfsPointer', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lfs-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('detects an un-pulled LFS pointer file', () => {
    const file = path.join(dir, 'pointer.onnx');
    fs.writeFileSync(
      file,
      'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 93959206\n',
    );
    expect(isGitLfsPointer(file)).toBe(true);
  });

  it('treats binary model content as a real model', () => {
    const file = path.join(dir, 'model.onnx');
    fs.writeFileSync(file, Buffer.from([0x08, 0x07, 0x12, 0x04, 0x00, 0xff]));
    expect(isGitLfsPointer(file)).toBe(false);
  });
});
