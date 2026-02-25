import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { DataSyncService } from './data-sync.service';
import { DataSyncProcessor } from './data-sync.processor';
import { User } from 'src/common/entities/user.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { Match } from 'src/common/entities/match.entity';
import { MatchFeedback } from 'src/common/entities/match-feedback.entity';

/**
 * Data Sync Module
 * ----------------
 * Provides reliable event-driven synchronization between PostgreSQL and AI service
 * Uses Bull queues with retry logic to ensure eventual consistency
 */
@Module({
  imports: [
    ConfigModule,
    SequelizeModule.forFeature([User, UserSummaries, Match, MatchFeedback]),
    BullModule.registerQueue({
      name: 'data-sync',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5s, then 10s, 20s
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs for debugging
      },
    }),
  ],
  providers: [DataSyncService, DataSyncProcessor],
  exports: [DataSyncService],
})
export class DataSyncModule {}
