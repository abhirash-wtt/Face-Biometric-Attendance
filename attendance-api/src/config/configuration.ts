const INSECURE_PRODUCTION_VALUES: Array<[string, (value: string | undefined) => boolean]> = [
  ['JWT_ACCESS_SECRET', (v) => !v || v.startsWith('change-me')],
  ['JWT_REFRESH_SECRET', (v) => !v || v.startsWith('change-me')],
  ['DATABASE_PASSWORD', (v) => !v || v === 'app'],
  ['ADMIN_PASSWORD', (v) => !v || v === 'Admin@123'],
  ['DEVICE_BOOTSTRAP_SECRET', (v) => !v || v === 'bind-device-once'],
  ['SMTP_HOST', (v) => !v],
];

/**
 * Production must not boot with the placeholder secrets from .env.example: they are
 * public in the repository, so anyone could mint JWTs or log in as the bootstrap admin.
 */
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const problems = INSECURE_PRODUCTION_VALUES.filter(([key, isInsecure]) => isInsecure(env[key])).map(
    ([key]) => key,
  );
  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_REFRESH_SECRET (must differ from JWT_ACCESS_SECRET)');
  }
  if ((env.STORAGE_PROVIDER || 'local') === 'minio') {
    if (!env.MINIO_ACCESS_KEY || env.MINIO_ACCESS_KEY === 'minio') problems.push('MINIO_ACCESS_KEY');
    if (!env.MINIO_SECRET_KEY || env.MINIO_SECRET_KEY === 'minio123') problems.push('MINIO_SECRET_KEY');
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
    password: process.env.DATABASE_PASSWORD || 'app',
    name: process.env.DATABASE_NAME || 'attendance',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'change-me-access',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
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
      accessKey: process.env.MINIO_ACCESS_KEY || 'minio',
      secretKey: process.env.MINIO_SECRET_KEY || 'minio123',
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
    comprefaceApiKey: process.env.COMPREFACE_API_KEY || '',
  },
  geofence: {
    enabled: process.env.GEOFENCE_ENABLED !== 'false',
    defaultRadiusM: Number(process.env.GEOFENCE_RADIUS_M) || 45,
    bufferM: Number(process.env.GEOFENCE_BUFFER_M) || 12,
    indoorRadiusM: Number(process.env.GEOFENCE_INDOOR_RADIUS_M) || 40,
  },
  retentionDays: Number(process.env.RETENTION_DAYS) || 90,
  attendanceCooldownSec: Number(process.env.ATTENDANCE_COOLDOWN_SEC) || 60,
  deviceBootstrapSecret: process.env.DEVICE_BOOTSTRAP_SECRET || 'bind-device-once',
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@attendance.local',
    password: process.env.ADMIN_PASSWORD || 'Admin@123',
  },
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'noreply@walkingtree.tech',
  },
});
