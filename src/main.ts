/**
 * Bootstrap for 2Connect API
 * --------------------------------
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestMetadataInterceptor } from './common/interceptors/request-metadata.interceptor';
import { AppModule } from './app.module';
import { LoggerService } from './common/logger/logger.service';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { json, urlencoded } from 'express';
import * as Sentry from '@sentry/node';

// Initialize Sentry early
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
  console.log('Sentry initialized for error monitoring');
}

async function bootstrap() {
  try {
    // Create Nest app with buffered logs so early logs aren't lost before logger is ready
    const app = await NestFactory.create(AppModule, {
      bufferLogs: true,
    });

    // Global limit for all requests
    app.use(json({ limit: '2mb' }));
    app.use(urlencoded({ extended: true, limit: '2mb' }));

    // Bigger limit ONLY for AI matches webhook (15mb)
    app.use('/api/v1/webhooks/matches-ready', json({ limit: '15mb' }));

    // SNS posts its notification envelopes with Content-Type: text/plain; charset=UTF-8
    // (per AWS docs) so the global `json()` middleware skips them. Add a route-local
    // parser that treats text/plain as JSON for the SES events webhook only.
    app.use(
      '/api/v1/webhooks/ses-events',
      json({ limit: '2mb', type: ['application/json', 'text/plain'] }),
    );

    // Resolve Config + custom Logger from DI
    const configService = app.get(ConfigService);
    const logger = app.get(LoggerService);

    // CORS: allow cross-origin calls
    app.enableCors({
      origin: [
        // Apr-17 Phase 2c: production apex subdomains
        'https://app.2connect.ai',       // frontend
        'https://api.2connect.ai',       // API itself (for tools that self-call)
        'https://ai.2connect.ai',        // AI service (for direct calls)
        // Marketing site may initiate signup navigations
        'https://2connect.ai',
        'https://www.2connect.ai',
        // Legacy / staging aliases (kept so pre-migration bookmarks keep working)
        'https://uat.2connect.ai',
        'https://ai.uat.2connect.ai',
        'https://admin.uat.2connect.ai',
        'https://dev.2connect.ai',
        'https://ai.dev.2connect.ai',
        'https://admin.dev.2connect.ai',
        'https://2connectv1-frontend.vercel.app',
        'https://2connect-admin-dashboard.vercel.app',
        'https://twoconnectv1-ai.onrender.com',
        'https://d3b1d0x5eutlxh.cloudfront.net',
        'https://d3o48j1o5gm632.cloudfront.net',
        'https://d3sx9sl9x2tgj2.cloudfront.net',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://host.docker.internal:5173',
        'http://host.docker.internal:5174',
        'http://host.docker.internal:5175',
      ],
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Platform', 'X-Timezone', 'X-Language', 'X-Screen', 'X-App-Version', 'X-Network'],
      credentials: true, // allow cookies/authorization headers
    });

    // Use our structured logger across Nest (replaces default console logger)
    app.useLogger(logger);

    // Prefix all routes: e.g., /api/v1/...
    app.setGlobalPrefix(configService.get('API_PREFIX', 'api'));

    // Versioning: /api/v1/* (you can add more versions later)
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: configService.get('API_VERSION', '1'),
    });

    // Validation: transform DTOs, strip unknown fields, and block extra properties
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true, // auto-transform payloads to DTO classes
        whitelist: true, // remove props not in DTO
        forbidNonWhitelisted: true, // throw if extra props are sent
        transformOptions: {
          enableImplicitConversion: true, // enable type coercion for query parameters
        },
      }),
    );

    // Global error handling (uniform JSON and logging)
    app.useGlobalFilters(new GlobalExceptionFilter(logger));

    // Wrap all responses in a consistent format
    app.useGlobalInterceptors(new RequestMetadataInterceptor(), new ResponseInterceptor());

    // Parse cookies (set a secret if you sign cookies)
    app.use(cookieParser(/* configService.get('COOKIE_SECRET') */));

    const nodeEnv = configService.get<string>('NODE_ENV') || 'development';

    // ✅ Enable Swagger ONLY if not production
    if (nodeEnv !== 'production') {
      const swaggerConfig = new DocumentBuilder()
        .setTitle('2Connect API')
        .setDescription('2Connect Backend API Documentation')
        .setVersion('1.0')
        .addCookieAuth('access_token') // enables cookie auth in Swagger UI
        .addBearerAuth() // enables Authorization: Bearer ... in Swagger UI
        .build();

      const document = SwaggerModule.createDocument(app, swaggerConfig);

      SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: {
          defaultModelsExpandDepth: -1, // hide schemas panel by default
          defaultModelExpandDepth: 0, // don't auto-expand models
        },
      });
    }
    // Port (default 3000)
    const port = parseInt(configService.get('PORT', '3000'), 10);

    // Catch unexpected errors to avoid silent crashes
    process.on('uncaughtException', error => {
      logger.error(`Uncaught Exception: ${error.message}`, error.stack, 'bootstrap');
    });
    process.on('unhandledRejection', reason => {
      logger.error(`Unhandled Rejection: ${String(reason)}`, undefined, 'bootstrap');
    });

    // Start HTTP server
    await app.listen(port);
    logger.log(`Server listening on port ${port}`, 'bootstrap');
  } catch (error) {
    // If bootstrap fails, surface the error and exit non-zero for container/orchestrator
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Top-level rejection safety (should rarely trigger because of try/catch above)
bootstrap().catch(error => {
  console.error('Bootstrap error:', error);
  process.exit(1);
});
