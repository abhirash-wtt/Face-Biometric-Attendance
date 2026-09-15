import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, readFileSync } from 'fs';
import { createServer } from 'https';
import { networkInterfaces } from 'os';
import { join, resolve } from 'path';
import { TLSSocket } from 'tls';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

type HttpsOptions = { key: Buffer; cert: Buffer };

/**
 * Browsers only grant camera and geolocation access on a secure context, so a phone
 * loading the kiosk over http://<lan-ip> cannot clock anyone in. Serving the same app
 * over HTTPS fixes that; run `npm run cert:dev` to create a local certificate.
 */
function loadHttpsOptions(
  logger: Logger,
  settings: { enabled: boolean; keyPath: string; certPath: string },
): HttpsOptions | null {
  if (!settings.enabled) return null;
  const keyPath = resolve(process.cwd(), settings.keyPath);
  const certPath = resolve(process.cwd(), settings.certPath);

  if (!existsSync(keyPath) || !existsSync(certPath)) {
    logger.warn(
      `HTTPS requested but no certificate found at ${keyPath} / ${certPath}. ` +
        'Run "npm run cert:dev" to create one. Continuing with HTTP only.',
    );
    return null;
  }
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

function lanAddresses(): string[] {
  const found: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      if (!found.includes(entry.address)) found.push(entry.address);
    }
  }
  return found;
}

function isLocalHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);
  const httpsSettings = {
    enabled: config.get<boolean>('https.enabled') === true,
    port: config.get<number>('https.port') ?? 3443,
    keyPath: config.get<string>('https.keyPath') ?? './certs/dev-key.pem',
    certPath: config.get<string>('https.certPath') ?? './certs/dev-cert.pem',
  };
  const httpsOptions = loadHttpsOptions(logger, httpsSettings);
  const httpsPort = httpsSettings.port;

  if (httpsOptions) {
    // Send browser page loads to HTTPS so the camera works, but leave API traffic on
    // HTTP alone: the React Native app and server-to-server callers are not subject
    // to the secure-context rule and should keep working unchanged.
    app.use((req: Request, res: Response, next: NextFunction) => {
      const encrypted = (req.socket as TLSSocket).encrypted === true;
      const wantsHtml = (req.headers.accept || '').includes('text/html');
      const host = (req.headers.host || '').replace(/:\d+$/, '');
      if (encrypted || !wantsHtml || isLocalHost(host)) return next();
      return res.redirect(302, `https://${host}:${httpsPort}${req.originalUrl}`);
    });
  }

  app.useStaticAssets(join(process.cwd(), 'public'), {
    setHeaders: (res, filePath) => {
      if (String(filePath).endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  });

  app.enableCors({ origin: true, credentials: true });
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Attendance Face Biometric API')
    .setDescription(
      'Enroll, identify, verify, and log attendance with face embeddings, liveness, and audit proof.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = config.get<number>('port') ?? 3000;

  if (httpsOptions) {
    // The HTTPS listener shares the initialised Express instance, so both schemes
    // serve the same routes, guards, and static kiosk assets.
    await app.init();
    createServer(httpsOptions, app.getHttpAdapter().getInstance()).listen(httpsPort);
  }

  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
  logger.log(`OpenAPI docs at http://localhost:${port}/docs`);
  logger.log(`Kiosk UI at http://localhost:${port}/`);

  if (httpsOptions) {
    logger.log(`HTTPS listening on https://localhost:${httpsPort}`);
    for (const ip of lanAddresses()) {
      logger.log(`Kiosk UI for phones (camera enabled) at https://${ip}:${httpsPort}/`);
    }
  } else {
    for (const ip of lanAddresses()) {
      logger.warn(
        `Phones reaching http://${ip}:${port}/ cannot use the camera or GPS. ` +
          'Run "npm run cert:dev" and set HTTPS_ENABLED=true to serve the kiosk over HTTPS.',
      );
    }
  }
}

bootstrap();
