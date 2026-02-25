import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule as IoRedisModule } from '@nestjs-modules/ioredis';

/**
 * Purpose
 * -------
 * Provides a Redis connection (ioredis) configured from environment variables
 * and exports it for use across the application.
 */

@Module({
  imports: [
    // Creates the Redis connection at runtime using values from ConfigService
    IoRedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Read connection settings from environment
        const host = config.get<string>('REDIS_HOST') || 'localhost';
        const port = Number(config.get<number>('REDIS_PORT') || 6379);
        const password = config.get<string>('REDIS_PASSWORD') || '';
        const username = config.get<string>('REDIS_USERNAME') || undefined;
        const keyPrefix = config.get<string>('REDIS_PREFIX') || '2Connect:';
        const db = Number(config.get<number>('REDIS_DB') || 0);
        const useTls = String(config.get('REDIS_TLS')) === 'true';

        // Build connection URL with the appropriate scheme
        const scheme = useTls ? 'rediss' : 'redis';
        const url = `${scheme}://${host}:${port}`;

        return {
          // Single-node Redis connection
          type: 'single',
          url,

          // ioredis client options
          options: {
            // Authentication
            password: password || undefined,
            username,

            // Key namespace prefix
            keyPrefix,

            // Logical database index
            db,

            // Enable TLS when requested
            tls: useTls ? {} : undefined,

            // Retry with incremental backoff (caps at ~2000 ms)
            retryStrategy: (times: number) => Math.min(times * 100, 2000),

            // Limit per-request retries
            maxRetriesPerRequest: 3,

            // Reconnect on common transient errors
            reconnectOnError: (err: Error) => {
              const msg = err.message.toLowerCase();
              return msg.includes('read only') || msg.includes('econnreset') ? true : false;
            },
          },
        };
      },
    }),
  ],
  // Expose the configured Redis module to other modules
  exports: [IoRedisModule],
})
export class RedisModule {}
