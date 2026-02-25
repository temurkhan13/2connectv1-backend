/**
 * DatabaseModule: centralizes Sequelize (Postgres) setup for the app.
 * It reads DB config from environment variables at runtime and builds a safe default pool.
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';

@Module({
  imports: [
    // We use forRootAsync so DB config comes from env at runtime (12-factor)
    SequelizeModule.forRootAsync({
      imports: [ConfigModule], // makes ConfigService available here
      useFactory: (configService: ConfigService) => {
        // Basic flags
        const isDev = configService.get('NODE_ENV') === 'development';
        const useSsl = String(configService.get('DB_SSL')) === 'true';

        return {
          // --- Dialect / Connection Target ---
          dialect: 'postgres',
          host: configService.get<string>('DB_HOST') || 'localhost',
          port: Number(configService.get<number>('DB_PORT') || 5432),
          username: configService.get<string>('DB_USERNAME') || 'postgres',
          password: configService.get<string>('DB_PASSWORD') || 'postgres',
          database: configService.get<string>('DB_DATABASE') || '2Connect_db',

          // --- Model Loading ---
          autoLoadModels: true,

          // Auto-create tables in development
          synchronize: isDev,

          // SQL logs only in dev
          logging: isDev ? console.log : false,

          // --- SSL for cloud DBs (e.g., RDS/Neon/Render) ---
          // `dialectOptions.ssl` needs `rejectUnauthorized:false` for many managed providers
          dialectOptions: useSsl
            ? {
                ssl: {
                  require: true,
                  rejectUnauthorized: false,
                },
              }
            : {},

          // --- Connection Pool (keeps DB stable under load) ---
          pool: {
            max: Number(configService.get('DB_POOL_MAX') || 10), // open connections
            min: Number(configService.get('DB_POOL_MIN') || 0),
            idle: Number(configService.get('DB_POOL_IDLE') || 10000), // ms before releasing idle
            acquire: Number(configService.get('DB_POOL_ACQUIRE') || 30000), // ms to get a conn
          },

          // --- Timezone handling ---
          timezone: '+00:00',
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
