import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';

/**
 * Sync job types for different data operations
 */
export enum SyncJobType {
  USER_PROFILE_UPDATE = 'user_profile_update',
  USER_SUMMARY_UPDATE = 'user_summary_update',
  MATCH_FEEDBACK = 'match_feedback',
  PERSONA_REFRESH = 'persona_refresh',
  EMBEDDING_UPDATE = 'embedding_update',
}

/**
 * Base sync job payload
 */
export interface BaseSyncJobPayload {
  type: SyncJobType;
  userId: string;
  timestamp: string;
  priority?: number;
}

export interface UserProfileSyncPayload extends BaseSyncJobPayload {
  type: SyncJobType.USER_PROFILE_UPDATE;
  changes: {
    field: string;
    oldValue?: any;
    newValue: any;
  }[];
}

export interface UserSummarySyncPayload extends BaseSyncJobPayload {
  type: SyncJobType.USER_SUMMARY_UPDATE;
  summaryId: string;
  summaryData: Record<string, any>;
}

export interface MatchFeedbackSyncPayload extends BaseSyncJobPayload {
  type: SyncJobType.MATCH_FEEDBACK;
  matchId: string;
  feedbackType: 'approve' | 'decline';
  reasons?: string[];
  reasonText?: string;
}

export interface PersonaRefreshPayload extends BaseSyncJobPayload {
  type: SyncJobType.PERSONA_REFRESH;
  triggeredBy: 'profile_change' | 'manual' | 'scheduled';
}

export interface EmbeddingUpdatePayload extends BaseSyncJobPayload {
  type: SyncJobType.EMBEDDING_UPDATE;
  embeddingType: 'requirements' | 'offerings';
  dimensions: string[];
}

export type SyncJobPayload =
  | UserProfileSyncPayload
  | UserSummarySyncPayload
  | MatchFeedbackSyncPayload
  | PersonaRefreshPayload
  | EmbeddingUpdatePayload;

/**
 * Data Sync Service
 * -----------------
 * Queues sync operations for reliable delivery to AI service
 * Implements event-driven synchronization with retry logic
 */
@Injectable()
export class DataSyncService {
  private readonly logger = new Logger(DataSyncService.name);

  constructor(
    @InjectQueue('data-sync')
    private readonly syncQueue: Queue<SyncJobPayload>,
  ) {}

  /**
   * Queue a user profile update for sync to AI service
   */
  async queueUserProfileSync(
    userId: string,
    changes: { field: string; oldValue?: any; newValue: any }[],
  ): Promise<Job<UserProfileSyncPayload>> {
    const payload: UserProfileSyncPayload = {
      type: SyncJobType.USER_PROFILE_UPDATE,
      userId,
      timestamp: new Date().toISOString(),
      changes,
    };

    this.logger.log(`Queueing user profile sync for ${userId}: ${changes.length} changes`);
    return this.syncQueue.add(payload, {
      priority: 2, // Medium priority
      delay: 1000, // 1 second delay to batch rapid changes
    }) as Promise<Job<UserProfileSyncPayload>>;
  }

  /**
   * Queue a user summary update for sync
   */
  async queueUserSummarySync(
    userId: string,
    summaryId: string,
    summaryData: Record<string, any>,
  ): Promise<Job<UserSummarySyncPayload>> {
    const payload: UserSummarySyncPayload = {
      type: SyncJobType.USER_SUMMARY_UPDATE,
      userId,
      summaryId,
      summaryData,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`Queueing summary sync for ${userId}`);
    return this.syncQueue.add(payload, {
      priority: 1, // High priority
    }) as Promise<Job<UserSummarySyncPayload>>;
  }

  /**
   * Queue match feedback for learning
   */
  async queueMatchFeedback(
    userId: string,
    matchId: string,
    feedbackType: 'approve' | 'decline',
    reasons?: string[],
    reasonText?: string,
  ): Promise<Job<MatchFeedbackSyncPayload>> {
    const payload: MatchFeedbackSyncPayload = {
      type: SyncJobType.MATCH_FEEDBACK,
      userId,
      matchId,
      feedbackType,
      reasons,
      reasonText,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`Queueing match feedback for ${userId}, match ${matchId}: ${feedbackType}`);
    return this.syncQueue.add(payload, {
      priority: 3, // Lower priority - feedback is fire-and-forget
    }) as Promise<Job<MatchFeedbackSyncPayload>>;
  }

  /**
   * Queue a persona refresh request
   */
  async queuePersonaRefresh(
    userId: string,
    triggeredBy: 'profile_change' | 'manual' | 'scheduled',
  ): Promise<Job<PersonaRefreshPayload>> {
    const payload: PersonaRefreshPayload = {
      type: SyncJobType.PERSONA_REFRESH,
      userId,
      triggeredBy,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`Queueing persona refresh for ${userId}, triggered by: ${triggeredBy}`);
    return this.syncQueue.add(payload, {
      priority: 2,
      delay: triggeredBy === 'profile_change' ? 5000 : 0, // Debounce profile changes
    }) as Promise<Job<PersonaRefreshPayload>>;
  }

  /**
   * Queue an embedding update
   */
  async queueEmbeddingUpdate(
    userId: string,
    embeddingType: 'requirements' | 'offerings',
    dimensions: string[],
  ): Promise<Job<EmbeddingUpdatePayload>> {
    const payload: EmbeddingUpdatePayload = {
      type: SyncJobType.EMBEDDING_UPDATE,
      userId,
      embeddingType,
      dimensions,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(
      `Queueing embedding update for ${userId}: ${embeddingType} (${dimensions.length} dims)`,
    );
    return this.syncQueue.add(payload, {
      priority: 1, // High priority - affects matching
    }) as Promise<Job<EmbeddingUpdatePayload>>;
  }

  /**
   * Get queue statistics for monitoring
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.syncQueue.getWaitingCount(),
      this.syncQueue.getActiveCount(),
      this.syncQueue.getCompletedCount(),
      this.syncQueue.getFailedCount(),
      this.syncQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Retry failed jobs
   */
  async retryFailedJobs(limit = 10): Promise<number> {
    const failedJobs = await this.syncQueue.getFailed(0, limit);
    let retried = 0;

    for (const job of failedJobs) {
      await job.retry();
      retried++;
    }

    this.logger.log(`Retried ${retried} failed sync jobs`);
    return retried;
  }
}
