import { Process, Processor, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bull';
import axios from 'axios';
import {
  SyncJobPayload,
  SyncJobType,
  UserProfileSyncPayload,
  UserSummarySyncPayload,
  MatchFeedbackSyncPayload,
  PersonaRefreshPayload,
  EmbeddingUpdatePayload,
} from './data-sync.service';

/**
 * Data Sync Processor
 * -------------------
 * Processes sync jobs from the Bull queue
 * Handles communication with AI service for data consistency
 */
@Processor('data-sync')
export class DataSyncProcessor {
  private readonly logger = new Logger(DataSyncProcessor.name);
  private readonly aiServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
  }

  @Process()
  async processSync(job: Job<SyncJobPayload>): Promise<void> {
    this.logger.log(`Processing sync job ${job.id}: ${job.data.type}`);

    switch (job.data.type) {
      case SyncJobType.USER_PROFILE_UPDATE:
        await this.handleUserProfileUpdate(job.data as UserProfileSyncPayload);
        break;
      case SyncJobType.USER_SUMMARY_UPDATE:
        await this.handleUserSummaryUpdate(job.data as UserSummarySyncPayload);
        break;
      case SyncJobType.MATCH_FEEDBACK:
        await this.handleMatchFeedback(job.data as MatchFeedbackSyncPayload);
        break;
      case SyncJobType.PERSONA_REFRESH:
        await this.handlePersonaRefresh(job.data as PersonaRefreshPayload);
        break;
      case SyncJobType.EMBEDDING_UPDATE:
        await this.handleEmbeddingUpdate(job.data as EmbeddingUpdatePayload);
        break;
      default:
        this.logger.warn(`Unknown sync job type: ${(job.data as any).type}`);
    }
  }

  private async handleUserProfileUpdate(payload: UserProfileSyncPayload): Promise<void> {
    const { userId, changes } = payload;

    try {
      await axios.post(`${this.aiServiceUrl}/api/v1/user/sync-profile`, {
        user_id: userId,
        changes,
        timestamp: payload.timestamp,
      }, {
        timeout: 30000,
      });

      this.logger.log(`Profile sync completed for user ${userId}`);
    } catch (error) {
      this.logger.error(`Profile sync failed for user ${userId}: ${error.message}`);
      throw error; // Will trigger retry
    }
  }

  private async handleUserSummaryUpdate(payload: UserSummarySyncPayload): Promise<void> {
    const { userId, summaryId, summaryData } = payload;

    try {
      await axios.post(`${this.aiServiceUrl}/api/v1/user/sync-summary`, {
        user_id: userId,
        summary_id: summaryId,
        summary_data: summaryData,
        timestamp: payload.timestamp,
      }, {
        timeout: 30000,
      });

      this.logger.log(`Summary sync completed for user ${userId}`);
    } catch (error) {
      this.logger.error(`Summary sync failed for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  private async handleMatchFeedback(payload: MatchFeedbackSyncPayload): Promise<void> {
    const { userId, matchId, feedbackType, reasons, reasonText } = payload;

    try {
      await axios.post(`${this.aiServiceUrl}/api/v1/user/feedback-with-reasons`, {
        user_id: userId,
        match_id: matchId,
        feedback_type: feedbackType,
        reason_tags: reasons || [],
        reason_text: reasonText || '',
        timestamp: payload.timestamp,
      }, {
        timeout: 15000,
      });

      this.logger.log(`Feedback sync completed for match ${matchId}`);
    } catch (error) {
      // Feedback is non-critical, log but don't throw on final attempt
      this.logger.error(`Feedback sync failed for match ${matchId}: ${error.message}`);
      throw error;
    }
  }

  private async handlePersonaRefresh(payload: PersonaRefreshPayload): Promise<void> {
    const { userId, triggeredBy } = payload;

    try {
      await axios.post(`${this.aiServiceUrl}/api/v1/user/refresh-persona`, {
        user_id: userId,
        triggered_by: triggeredBy,
        timestamp: payload.timestamp,
      }, {
        timeout: 60000, // Persona refresh can take longer
      });

      this.logger.log(`Persona refresh completed for user ${userId}`);
    } catch (error) {
      this.logger.error(`Persona refresh failed for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  private async handleEmbeddingUpdate(payload: EmbeddingUpdatePayload): Promise<void> {
    const { userId, embeddingType, dimensions } = payload;

    try {
      await axios.post(`${this.aiServiceUrl}/api/v1/user/update-embeddings`, {
        user_id: userId,
        embedding_type: embeddingType,
        dimensions,
        timestamp: payload.timestamp,
      }, {
        timeout: 45000,
      });

      this.logger.log(`Embedding update completed for user ${userId}`);
    } catch (error) {
      this.logger.error(`Embedding update failed for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<SyncJobPayload>, error: Error): void {
    this.logger.error(
      `Sync job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
      {
        jobType: job.data.type,
        userId: job.data.userId,
        attemptsMade: job.attemptsMade,
      },
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job<SyncJobPayload>): void {
    this.logger.debug(`Sync job ${job.id} completed successfully`, {
      jobType: job.data.type,
      userId: job.data.userId,
    });
  }
}
