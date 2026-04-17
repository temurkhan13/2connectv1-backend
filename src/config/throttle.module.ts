import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule as BaseThrottlerModule, ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Purpose
 * -------
 * Configures global API rate limiting using @nestjs/throttler with values read from environment variables.
 * Exposes the configured ThrottlerModule for use across the application.
 */

@Module({
  imports: [
    // Creates the Throttler configuration at runtime using ConfigService
    BaseThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): ThrottlerModuleOptions => {
        // Read TTL and request limit from environment.
        // @nestjs/throttler v5 takes ttl in MILLISECONDS (this was previously
        // passed raw from an env var named THROTTLE_TTL that documented itself
        // as "seconds", so the effective window was 60ms — essentially no
        // throttling). Multiply by 1000 to get the intended window.
        const ttl = Number(config.get<number>('THROTTLE_TTL') ?? 60) * 1000;
        const limit = Number(config.get<number>('THROTTLE_LIMIT') ?? 10); // max requests per window
        const isTest = config.get<string>('NODE_ENV') === 'test';

        return {
          // Single throttler definition; additional entries can define separate groups
          throttlers: [
            {
              ttl,
              limit,
            },
          ],

          // Skips throttling when running tests
          skipIf: () => isTest,

          // Error message used when a request is rate limited
          errorMessage:
            config.get<string>('THROTTLE_ERROR_MESSAGE') ||
            'Too many requests. Please try again shortly.',

          // Redis storage configuration (commented out); enables shared counters across instances
          // storage: new ThrottlerStorageRedisService({
          //   host: config.get<string>('REDIS_HOST') || 'localhost',
          //   port: Number(config.get<number>('REDIS_PORT') || 6379),
          //   password: config.get<string>('REDIS_PASSWORD') || undefined,
          //   tls: String(config.get('REDIS_TLS')) === 'true' ? {} : undefined,
          //   keyPrefix: config.get<string>('REDIS_PREFIX') || '2Connect:',
          // }),
        };
      },
    }),
  ],
  // Re-exports the configured Throttler module
  exports: [BaseThrottlerModule],
})
export class ThrottlerModule {}
