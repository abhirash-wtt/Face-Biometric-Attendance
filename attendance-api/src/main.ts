import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

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

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
  logger.log(`OpenAPI docs at http://localhost:${port}/docs`);
  logger.log(`Kiosk UI at http://localhost:${port}/`);
}

bootstrap();
