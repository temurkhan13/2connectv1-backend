/**
 * NotificationModule
 * -------------------
 * Purpose: Provide notification features using Firebase Admin and store user FCM tokens.
 * Summary:
 *  - Registers Sequelize model: UserFcmToken
 *  - Exposes FcmController endpoints
 *  - Initializes a singleton Firebase Admin app (from service account if provided)
 *  - Provides NotificationService for saving tokens and sending notifications
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import * as admin from 'firebase-admin';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NotificationService } from 'src/modules/notifications/notification.service';
import { FcmController } from 'src/modules/notifications/notification.controller';
import { UserFcmToken } from 'src/common/entities/user-fcm-token.entity';

// Injection token for the Firebase Admin app instance
export const FIREBASE_APP = 'FIREBASE_APP';

@Module({
  // Loads env config and registers the FCM token model
  imports: [ConfigModule.forRoot({ isGlobal: true }), SequelizeModule.forFeature([UserFcmToken])],

  // REST endpoints for notifications
  controllers: [FcmController],

  providers: [
    {
      // Provides a Firebase Admin app instance
      provide: FIREBASE_APP,
      useFactory: (config: ConfigService) => {
        // 1) Reuse existing app if already initialized
        if (admin.apps.length) return admin.app();

        // 2) Read service account path from config or env
        const credPathFromConfig = config.get<string>('GOOGLE_APPLICATION_CREDENTIALS');
        const credPathFromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        const credPath = credPathFromConfig || credPathFromEnv;

        // 3) If no path is set, fall back to default credentials
        if (!credPath) {
          return admin.initializeApp();
        }

        // 4) Resolve to absolute path (important in Docker/EC2)
        const resolved = path.resolve(credPath);

        try {
          // 5) Check if path exists
          if (!fs.existsSync(resolved)) {
            throw new Error(`[FIREBASE_APP] Credentials file does not exist at path: ${resolved}`);
          }

          // 6) Check if it is a file (not a directory) to avoid EISDIR
          const stat = fs.lstatSync(resolved);
          if (!stat.isFile()) {
            throw new Error(
              `[FIREBASE_APP] Credentials path is not a file (likely a directory): ${resolved}`,
            );
          }

          // 7) Read and parse the service account JSON
          const file = fs.readFileSync(resolved, 'utf8'); // use resolved here
          let serviceAccount: admin.ServiceAccount;

          try {
            serviceAccount = JSON.parse(file);
          } catch (parseErr: any) {
            throw new Error(
              `[FIREBASE_APP] Failed to parse Firebase credentials JSON at ${resolved}: ${parseErr.message}`,
            );
          }

          // 8) Initialize Firebase Admin with explicit service account credentials
          return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
        } catch (err) {
          // 9) Log and rethrow so you see a clear error in UAT logs
          console.error('[FIREBASE_APP] Error while initializing Firebase Admin:', err);
          throw err;
        }
      },
      inject: [ConfigService],
    },

    // Business logic for saving tokens and sending pushes
    NotificationService,
  ],

  // Make the service available to other modules
  exports: [NotificationService],
})
export class NotificationModule {}
