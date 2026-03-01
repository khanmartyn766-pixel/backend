import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const corsOrigin = configService.get<string>('CORS_ORIGIN') || '*';
  app.enableCors({ origin: corsOrigin });

  const port = Number(configService.get<string>('PORT') || 3000);
  const host = configService.get<string>('HOST') || '0.0.0.0';
  await app.listen(port, host);
  console.log(`API listening on http://${host}:${port}/api/v1`);
}

bootstrap();
