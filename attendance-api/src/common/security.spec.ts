import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Controller, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EvidenceController } from '../storage/evidence.controller';
import { StorageService, isSafeEvidenceKey } from '../storage/storage.service';
import { AuthRateLimit, isAuthRateLimited } from './decorators/auth-rate-limit.decorator';

const KEY = 'enroll/2026-09-28/3329b1de-c0cd-4748-b70f-d9bbc099685b.jpg';

@Controller()
class ProbeController {
  @Post('open')
  open() {
    return { ok: true };
  }

  @Post('login')
  @AuthRateLimit()
  login() {
    return { ok: true };
  }
}

describe('evidence and rate-limit security (HTTP)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
  const uploads = path.join(root, 'uploads');
  let app: INestApplication;
  let base: string;
  let storage: StorageService;

  beforeAll(async () => {
    fs.mkdirSync(path.join(uploads, path.dirname(KEY)), { recursive: true });
    fs.writeFileSync(path.join(uploads, KEY), Buffer.from([0xff, 0xd8, 0xff]));
    fs.writeFileSync(path.join(root, 'secret.env'), 'JWT_ACCESS_SECRET=leak');

    const settings: Record<string, unknown> = {
      'storage.provider': 'local',
      'storage.localDir': uploads,
      'jwt.accessSecret': 'test-secret',
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [
            { name: 'default', ttl: 60_000, limit: 50 },
            { name: 'auth', ttl: 60_000, limit: 3, skipIf: (ctx) => !isAuthRateLimited(ctx) },
          ],
        }),
      ],
      controllers: [EvidenceController, ProbeController],
      providers: [
        StorageService,
        { provide: ConfigService, useValue: { get: (key: string) => settings[key] } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('serves an image through a signed link', async () => {
    const res = await fetch(base + storage.signUrl(`/evidence/${KEY}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
  });

  it('rejects unsigned, tampered and expired links', async () => {
    expect((await fetch(`${base}/evidence/${KEY}`)).status).toBe(403);
    const signed = storage.signUrl(`/evidence/${KEY}`)!;
    const tampered = signed.replace(/sig=(.)/, (_, c) => `sig=${c === 'A' ? 'B' : 'A'}`);
    expect((await fetch(base + tampered)).status).toBe(403);
    const other = KEY.replace('3329b1de', '40b2556a');
    expect((await fetch(base + signed.replace(KEY, other))).status).toBe(403);
    const expired = storage.signUrl(`/evidence/${KEY}`, -10)!;
    expect((await fetch(base + expired)).status).toBe(403);
  });

  it.each([
    '/evidence/..%2Fsecret.env',
    '/evidence/..%2F..%2Fsecret.env',
    '/evidence/enroll%2F..%2F..%2Fsecret.env',
    '/evidence/..%5Csecret.env',
    '/evidence/%2E%2E/secret.env',
  ])('never serves files outside the uploads folder: %s', async (url) => {
    const res = await fetch(`${base}${url}?exp=9999999999&sig=x`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await res.text()).not.toContain('leak');
  });

  it('refuses to sign or read keys that do not match the storage layout', async () => {
    expect(isSafeEvidenceKey('../secret.env')).toBe(false);
    expect(isSafeEvidenceKey('enroll/2026-09-28/../../x.jpg')).toBe(false);
    expect(storage.signUrl('/evidence/../secret.env')).toBeNull();
    expect(await storage.get('/evidence/../secret.env')).toBeNull();
  });

  it('applies the strict limit only to auth-rate-limited routes', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await fetch(`${base}/login`, { method: 'POST' })).status);
    expect(statuses).toEqual([201, 201, 201, 429]);
    expect((await fetch(`${base}/open`, { method: 'POST' })).status).toBe(201);
  });
});
