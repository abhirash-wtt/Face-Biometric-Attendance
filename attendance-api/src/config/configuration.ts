/** Secrets the API cannot run without in any environment; there are no built-in defaults. */
const REQUIRED_SECRETS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'DATABASE_PASSWORD',
  'DEVICE_BOOTSTRAP_SECRET',
];

/**
 * Values that were once committed to this repository. They are public, so production must
 * refuse them even when someone copies an old .env file.
 */
const LEAKED_VALUES: Record<string, string[]> = {
  DATABASE_PASSWORD: ['app'],
  ADMIN_PASSWORD: ['Admin@123'],
  DEVICE_BOOTSTRAP_SECRET: ['bind-device-once'],
  MINIO_ACCESS_KEY: ['minio'],
  MINIO_SECRET_KEY: ['minio123'],
};

/** `.env.example` uses `<...>` placeholders; treat them the same as an unset value. */
export function isPlaceholder(value: string | undefined): boolean {
  return /^<.*>$/.test((value || '').trim());
}

function isUnset(value: string | undefined): boolean {
  return !value || !value.trim() || isPlaceholder(value);
}

/** Reads a secret from the environment; empty and placeholder values count as unset. */
export function secret(key: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[key];
  return isUnset(value) ? undefined : value!.trim();
}

function usesMinio(env: NodeJS.ProcessEnv): boolean {
  return (env.STORAGE_PROVIDER || 'local') === 'minio';
}

/**
 * Fails fast, before any module connects to the database or signs a token, when a secret
 * is missing or still holds a `.env.example` placeholder.
 */
export function assertSecretsConfigured(env: NodeJS.ProcessEnv = process.env) {
  const keys = usesMinio(env)
    ? [...REQUIRED_SECRETS, 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY']
    : REQUIRED_SECRETS;
  const missing = keys.filter((key) => isUnset(env[key]));
  if (missing.length > 0) {
    throw new Error(
      `Missing required secrets: ${missing.join(', ')}. ` +
        'Copy attendance-api/.env.example to attendance-api/.env and set real values (see docs/ENV.md).',
    );
  }
  assertProductionConfig(env);
}

/**
 * Production additionally rejects secrets that are public (committed in the past or
 * derived from the examples), so nobody can mint JWTs or log in as the bootstrap admin.
 */
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const keys = [...REQUIRED_SECRETS, 'ADMIN_PASSWORD', 'SMTP_HOST'];
  if (usesMinio(env)) keys.push('MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY');
  const problems = keys.filter((key) => {
    const value = env[key];
    if (isUnset(value)) return true;
    if (key.startsWith('JWT_') && value!.startsWith('change-me')) return true;
    return (LEAKED_VALUES[key] || []).includes(value!);
  });
  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_REFRESH_SECRET (must differ from JWT_ACCESS_SECRET)');
  }
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start with NODE_ENV=production: set secure values for ${problems.join(', ')}. ` +
        'See attendance-api/.env.production.example.',
    );
  }
}

export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV || 'local',
  port: Number(process.env.PORT) || 3000,
  // Express "trust proxy" value. Only set it when every request arrives through a reverse
  // proxy you control; otherwise clients can spoof X-Forwarded-For to dodge rate limits.
  trustProxy: process.env.TRUST_PROXY || '',
  rateLimit: {
    perMinute: Number(process.env.RATE_LIMIT_PER_MIN) || 600,
    authPerMinute: Number(process.env.AUTH_RATE_LIMIT_PER_MIN) || 20,
    loginMaxFailures: Number(process.env.LOGIN_MAX_FAILURES) || 5,
    loginLockoutSec: Number(process.env.LOGIN_LOCKOUT_SEC) || 15 * 60,
  },
  https: {
    // Phone browsers only expose the camera and GPS on a secure context, so the kiosk
    // needs HTTPS whenever it is reached by hostname or LAN IP instead of localhost.
    enabled: process.env.HTTPS_ENABLED === 'true' || !!process.env.HTTPS_KEY_PATH,
    port: Number(process.env.HTTPS_PORT) || 3443,
    keyPath: process.env.HTTPS_KEY_PATH || './certs/dev-key.pem',
    certPath: process.env.HTTPS_CERT_PATH || './certs/dev-cert.pem',
  },
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    user: process.env.DATABASE_USER || 'app',
    password: secret('DATABASE_PASSWORD'),
    name: process.env.DATABASE_NAME || 'attendance',
  },
  jwt: {
    accessSecret: secret('JWT_ACCESS_SECRET'),
    refreshSecret: secret('JWT_REFRESH_SECRET'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    localDir: process.env.LOCAL_STORAGE_DIR || './uploads',
    minio: {
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: Number(process.env.MINIO_PORT) || 9000,
      accessKey: secret('MINIO_ACCESS_KEY'),
      secretKey: secret('MINIO_SECRET_KEY'),
      bucket: process.env.MINIO_BUCKET || 'attendance-evidence',
      useSSL: process.env.MINIO_USE_SSL === 'true',
    },
  },
  recognition: {
    provider: process.env.RECOGNITION_PROVIDER || 'internal',
    onnxModelPath: process.env.ONNX_MODEL_PATH || './models/arcface_mobile.onnx',
    // The prototype fallback cannot tell different people apart reliably, so production
    // refuses to start without the ONNX model unless explicitly overridden.
    requireModel: process.env.REQUIRE_FACE_MODEL
      ? process.env.REQUIRE_FACE_MODEL === 'true'
      : process.env.NODE_ENV === 'production',
    similarityThreshold: (() => {
      const parsed = Number(process.env.SIMILARITY_THRESHOLD);
      const value = Number.isFinite(parsed) ? parsed : 0.60;
      return Math.max(0.0, Math.min(1.0, value));
    })(),
    livenessThreshold: Number(process.env.LIVENESS_THRESHOLD) || 0.6,
    topK: Number(process.env.IDENTIFY_TOP_K) || 5,
    maxFaceSamples: Number(process.env.MAX_FACE_SAMPLES) || 10,
    minFaceSamples: Number(process.env.MIN_FACE_SAMPLES) || 3,
    comprefaceUrl: process.env.COMPREFACE_URL || 'http://localhost:8000',
    comprefaceApiKey: secret('COMPREFACE_API_KEY') || '',
  },
  geofence: {
    enabled: process.env.GEOFENCE_ENABLED !== 'false',
    defaultRadiusM: Number(process.env.GEOFENCE_RADIUS_M) || 45,
    bufferM: Number(process.env.GEOFENCE_BUFFER_M) || 12,
    indoorRadiusM: Number(process.env.GEOFENCE_INDOOR_RADIUS_M) || 40,
  },
  retentionDays: Number(process.env.RETENTION_DAYS) || 90,
  attendanceCooldownSec: Number(process.env.ATTENDANCE_COOLDOWN_SEC) || 60,
  deviceBootstrapSecret: secret('DEVICE_BOOTSTRAP_SECRET'),
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@attendance.local',
    password: secret('ADMIN_PASSWORD'),
  },
  // Optional demo logins created on boot. Each account is skipped while its password is unset.
  demoAccounts: {
    employeePassword: secret('DEMO_EMPLOYEE_PASSWORD'),
    buPassword: secret('DEMO_BU_PASSWORD'),
    hrPassword: secret('DEMO_HR_PASSWORD'),
    managerPassword: secret('DEMO_MANAGER_PASSWORD'),
  },
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: secret('SMTP_USER') || '',
    pass: secret('SMTP_PASS') || '',
    from: process.env.MAIL_FROM || 'noreply@walkingtree.tech',
  },
});
