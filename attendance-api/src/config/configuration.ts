export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV || 'local',
  port: Number(process.env.PORT) || 3000,
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
    similarityThreshold: (() => {
      const parsed = Number(process.env.SIMILARITY_THRESHOLD);
      const value = Number.isFinite(parsed) ? parsed : 0.8;
      return Math.max(0.0, Math.min(1.0, value));
    })(),
    livenessThreshold: Number(process.env.LIVENESS_THRESHOLD) || 0.6,
    topK: Number(process.env.IDENTIFY_TOP_K) || 5,
    maxFaceSamples: Number(process.env.MAX_FACE_SAMPLES) || 10,
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
});
