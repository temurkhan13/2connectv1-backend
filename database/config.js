'use strict';

/**
 * Load environment variables from .env into process.env
 * Make sure you have a .env at project root before running migrations/seeders.
 */
require('dotenv').config();

/**
 * Read an env var with a typed fallback.
 * - If defaultValue is a number  -> parseInt the env value
 * - If defaultValue is a boolean -> accept: 'true' | '1' | 'yes' | 'y'
 * - Otherwise                    -> return raw string
 *
 * This avoids repetitive parsing in the config below.
 */
function getEnvVar(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;

  if (typeof defaultValue === 'number') {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? defaultValue : n;
  }

  if (typeof defaultValue === 'boolean') {
    const val = String(raw).toLowerCase().trim();
    return val === 'true' || val === '1' || val === 'yes' || val === 'y';
  }

  return raw;
}

/**
 * Base (shared) Sequelize options applied to all environments.
 * - dialect: Postgres
 * - define:  global model defaults (underscored column names + timestamps)
 * - pool:    connection pool tuning via env
 * - migration/seeder storage tables: keep CLI state in DB (not in files)
 * - timezone: run timestamps in UTC by default (override with DB_TZ)
 */
const base = {
  dialect: 'postgres',
  define: {
    underscored: true, // created_at, updated_at instead of camelCase
    timestamps: true, // auto-manage created_at/updated_at
  },
  pool: {
    max: getEnvVar('DB_POOL_MAX', 10),
    min: getEnvVar('DB_POOL_MIN', 0),
    idle: getEnvVar('DB_POOL_IDLE', 10000),
    acquire: getEnvVar('DB_POOL_ACQUIRE', 30000),
  },
  // Track migrations/seeders in Postgres tables (so CLI knows what ran)
  migrationStorage: 'sequelize',
  migrationStorageTableName: 'sequelize_migrations',
  seederStorage: 'sequelize',
  seederStorageTableName: 'sequelize_seeds',
  // Force UTC unless explicitly overridden by DB_TZ
  timezone: getEnvVar('DB_TZ', 'UTC'),
};

/**
 * If DATABASE_URL is set, prefer it over discrete DB_* variables.
 * Example: postgres://user:pass@host:5432/dbname
 */
const useDbUrl = !!process.env.DATABASE_URL;

/**
 * SSL handling:
 * - DB_SSL=true to enable SSL
 * - If host is localhost/127.0.0.1, we skip SSL by default
 * - DB_SSL_REJECT_UNAUTHORIZED toggles cert validation for managed DBs
 *   (RDS/Neon/Render/Heroku often need rejectUnauthorized=false in dev)
 */
const wantSSL = getEnvVar('DB_SSL', false);
const isLocalhost = ['localhost', '127.0.0.1'].includes(getEnvVar('DB_HOST', 'localhost'));

const prodDialectOptions =
  wantSSL && !isLocalhost
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: getEnvVar('DB_SSL_REJECT_UNAUTHORIZED', false),
        },
      }
    : {};

/**
 * Export per-environment configs.
 *
 * NOTE on env var names:
 * - This file expects: DB_USERNAME / DB_PASSWORD / DB_DATABASE / DB_HOST / DB_PORT
 *   (Make sure your .env uses these names)
 *
 * - Toggle SQL logs with SQL_LOG=true|false in development.
 */
module.exports = {
  development: {
    // Prefer DATABASE_URL if provided; fall back to discrete credentials
    ...(useDbUrl
      ? { use_env_variable: 'DATABASE_URL' }
      : {
          username: getEnvVar('DB_USERNAME', 'na'),
          password: getEnvVar('DB_PASSWORD', 'na'),
          database: getEnvVar('DB_DATABASE', 'na'),
          host: getEnvVar('DB_HOST', 'localhost'),
          port: getEnvVar('DB_PORT', 5432),
          dialect: 'postgres',
        }),
    ...base,
    // Print SQL in dev if SQL_LOG=true (or default true)
    logging: getEnvVar('SQL_LOG', true) ? console.log : false,
  },

  uat: {
    ...(useDbUrl
      ? { use_env_variable: 'DATABASE_URL' }
      : {
          username: getEnvVar('DB_USERNAME', 'postgres'),
          password: getEnvVar('DB_PASSWORD', 'postgres'),
          database: getEnvVar('DB_DATABASE', '2Connect_db_test'),
          host: getEnvVar('DB_HOST', 'localhost'),
          port: getEnvVar('DB_PORT', 5432),
          dialect: 'postgres',
        }),
    ...base,
    // Print SQL in dev if SQL_LOG=true (or default true)
    logging: getEnvVar('SQL_LOG', true) ? console.log : false,
  },

  production: {
    ...(useDbUrl
      ? { use_env_variable: 'DATABASE_URL' }
      : {
          username: getEnvVar('DB_USERNAME', 'postgres'),
          password: getEnvVar('DB_PASSWORD', 'postgres'),
          database: getEnvVar('DB_DATABASE', '2Connect_db'),
          host: getEnvVar('DB_HOST', 'localhost'),
          port: getEnvVar('DB_PORT', 5432),
          dialect: 'postgres',
        }),
    ...base,
    logging: false, // silence SQL logs in prod
    dialectOptions: prodDialectOptions, // attach SSL only when needed
  },
};
