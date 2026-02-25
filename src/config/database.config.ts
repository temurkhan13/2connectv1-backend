import { registerAs } from '@nestjs/config';

/**
 * Database Configuration
 * -----------------------
 * This configuration file defines how the application connects to the PostgreSQL database.
 * It uses environment variables for flexibility across development, staging, and production environments.
 *
 * The configuration is registered under the key 'database',
 * so it can later be accessed via `configService.get('database')` in any module.
 */

export default registerAs('database', () => ({
  /**
   * Database Host
   * -------------
   * Hostname or IP address of the PostgreSQL server.
   * Default: 'localhost' (useful for local development)
   */
  host: process.env.DB_HOST || 'localhost',

  /**
   * Database Port
   * -------------
   * TCP port used by PostgreSQL server.
   * Default: 5432
   */
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,

  /**
   * Database Username
   * -----------------
   * Username used to authenticate with the database.
   * Default: 'postgres'
   */
  username: process.env.DB_USERNAME || 'na',

  /**
   * Database Password
   * -----------------
   * Password for the database user.
   * Default: 'postgres'
   */
  password: process.env.DB_PASSWORD || 'na',

  /**
   * Database Name
   * -------------
   * The specific database schema the app will connect to.
   */
  database: process.env.DB_DATABASE || 'na',
  dialect: 'postgres',

  /**
   * SSL Mode
   * --------
   * Enables or disables SSL for database connections.
   * Should be 'true' in production environments (like AWS RDS).
   * Default: false
   */
  ssl: process.env.DB_SSL === 'true',
}));
