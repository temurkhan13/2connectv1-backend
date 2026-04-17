/**
 * AI Service Facade
 * ------------------
 * Main entry point for all AI service operations
 * Provides a unified interface for the rest of the application
 */

import { Injectable, Logger } from '@nestjs/common';
import { AIUserService } from 'src/integration/ai-service/services/user.service';
import {
  UserRegisterRequest,
  ApproveSummaryRequest,
  InitiateAIChatRequest,
  UserFeedbackRequest,
  ModifyQuestionTextRequest,
  predictAnswerPayload,
  MatchExplanationRequest,
  IceBreakersRequest,
  MatchFeedbackWithReasonsRequest,
  // Conversational Onboarding
  OnboardingStartRequest,
  OnboardingChatRequest,
  OnboardingCompleteRequest,
} from 'src/integration/ai-service/types/requests.type';
import {
  UserRegisterResponse,
  ApproveSummaryResponse,
  InitiateAIChatResponse,
  UserFeedbackResponse,
  GenerateQuestionTextResponse,
  PredictAnswerResponseFromAI,
  MatchExplanationResponse,
  IceBreakersResponse,
  MatchFeedbackWithReasonsResponse,
  // Conversational Onboarding
  OnboardingStartResponse,
  OnboardingChatResponse,
  OnboardingProgressResponse,
  OnboardingFinalizeResponse,
  OnboardingCompleteResponse,
  // Matching
  UserMatchesResponse,
  MatchingStatsResponse,
} from 'src/integration/ai-service/types/responses.type';

@Injectable()
export class AIServiceFacade {
  private readonly logger = new Logger(AIServiceFacade.name);
  private readonly TIMEOUT_MS = 90000; // 90s — must be >= AI_SERVICE_TIMEOUT (60s HTTP) + headroom for slot extraction on long onboarding messages (see Apr-18 Follow-up 25)

  constructor(private readonly userService: AIUserService) {}

  private async executeWithResilience<T>(
    operation: () => Promise<T>,
    operationName: string,
    useTimeout = true,
  ): Promise<T> {
    try {
      if (useTimeout) {
        return await Promise.race([
          operation(),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Operation timed out')), this.TIMEOUT_MS),
          ),
        ]);
      }
      return await operation();
    } catch (error) {
      this.logger.error(`AI Service Error [${operationName}]: ${error.message}`);
      throw error;
    }
  }

  /**
   * Register a new user with AI service
   */
  async registerUser(request: UserRegisterRequest): Promise<UserRegisterResponse> {
    return this.executeWithResilience(() => this.userService.registerUser(request), 'registerUser');
  }

  /**
   * Approve user's AI-generated summary
   */
  async approveSummary(request: ApproveSummaryRequest): Promise<ApproveSummaryResponse> {
    return this.executeWithResilience(
      () => this.userService.approveSummary(request),
      'approveSummary',
    );
  }

  /**
   * Notify AI service that user edited their profile.
   * Triggers re-embedding and re-matching pipeline.
   */
  async profileUpdated(userId: string): Promise<any> {
    return this.executeWithResilience(
      () => this.userService.profileUpdated(userId),
      'profileUpdated',
    );
  }

  /**
   * Initiate AI-to-AI chat between matched users
   */
  async initiateAIChat(request: InitiateAIChatRequest): Promise<InitiateAIChatResponse> {
    return this.executeWithResilience(
      () => this.userService.initiateAIChat(request),
      'initiateAIChat',
    );
  }

  /**
   * Submit user feedback for learning
   * Fire-and-forget: catch errors so we don't block the UI
   */
  async submitFeedback(request: UserFeedbackRequest): Promise<UserFeedbackResponse> {
    try {
      return await this.userService.submitFeedback(request);
    } catch (error) {
      this.logger.error(`Failed to submit feedback (non-blocking): ${error.message}`);
      // Return a dummy success to keep frontend happy, or rethrow if strictly needed
      // For now, consistent with "fire and forget" logic in dashboard service
      return { success: true } as any;
    }
  }

  /**
   * Trigger Match Cycle
   */
  async triggerMatchCycle() {
    return this.executeWithResilience(
      () => this.userService.triggerMatchCycle(),
      'triggerMatchCycle',
      false, // Long running operation, maybe no timeout? or longer timeout
    );
  }

  /**
   * Modify Question Text
   */
  async modifyQuestionText(
    request: ModifyQuestionTextRequest,
  ): Promise<GenerateQuestionTextResponse> {
    return this.executeWithResilience(
      () => this.userService.modifyQuestionText(request),
      'modifyQuestionText',
    );
  }

  /**
   * Predict Answer
   */
  async predictAnswer(request: predictAnswerPayload): Promise<PredictAnswerResponseFromAI> {
    return this.executeWithResilience(
      () => this.userService.predictAnswer(request),
      'predictAnswer',
    );
  }

  /**
   * Get Match Explanation
   * Phase 1.1: Match Explanation UI
   */
  async getMatchExplanation(request: MatchExplanationRequest): Promise<MatchExplanationResponse> {
    return this.executeWithResilience(
      () => this.userService.getMatchExplanation(request),
      'getMatchExplanation',
    );
  }

  /**
   * Get Ice Breakers
   * Phase 1.2: Guided First Message
   */
  async getIceBreakers(request: IceBreakersRequest): Promise<IceBreakersResponse> {
    return this.executeWithResilience(
      () => this.userService.getIceBreakers(request),
      'getIceBreakers',
    );
  }

  /**
   * Submit Feedback with Reasons
   * Phase 2.1: Feedback Learning Loop
   */
  async submitFeedbackWithReasons(
    request: MatchFeedbackWithReasonsRequest,
  ): Promise<MatchFeedbackWithReasonsResponse> {
    try {
      return await this.userService.submitFeedbackWithReasons(request);
    } catch (error) {
      this.logger.error(`Failed to submit feedback reasons (non-blocking): ${error.message}`);
      return { success: true } as any;
    }
  }

  // ==========================================
  // Conversational Onboarding Methods
  // Dynamic Slot-Filling, Multi-Turn Context, Progressive Disclosure
  // ==========================================

  /**
   * Start Onboarding Session
   * Initiates a new conversational onboarding session
   */
  async startOnboardingSession(request: OnboardingStartRequest): Promise<OnboardingStartResponse> {
    return this.executeWithResilience(
      () => this.userService.startOnboardingSession(request),
      'startOnboardingSession',
    );
  }

  /**
   * Onboarding Chat
   * Sends a chat message and extracts slots from user response
   */
  async onboardingChat(request: OnboardingChatRequest): Promise<OnboardingChatResponse> {
    return this.executeWithResilience(
      () => this.userService.onboardingChat(request),
      'onboardingChat',
    );
  }

  /**
   * Get Onboarding Progress
   * Retrieves progress for an onboarding session
   */
  async getOnboardingProgress(sessionId: string): Promise<OnboardingProgressResponse> {
    return this.executeWithResilience(
      () => this.userService.getOnboardingProgress(sessionId),
      'getOnboardingProgress',
    );
  }

  /**
   * Finalize Onboarding
   * Finalizes session and returns collected data
   */
  async finalizeOnboarding(sessionId: string): Promise<OnboardingFinalizeResponse> {
    return this.executeWithResilience(
      () => this.userService.finalizeOnboarding(sessionId),
      'finalizeOnboarding',
    );
  }

  /**
   * Complete Onboarding
   * Completes onboarding and triggers profile/persona creation
   * NOTE: Long-running operation (persona generation + embeddings), timeout disabled
   */
  async completeOnboarding(
    request: OnboardingCompleteRequest,
  ): Promise<OnboardingCompleteResponse> {
    return this.executeWithResilience(
      () => this.userService.completeOnboarding(request),
      'completeOnboarding',
      false, // Long running operation - persona generation can take 30-60s
    );
  }

  // ==========================================
  // Matching Methods
  // Get matches from AI service
  // ==========================================

  /**
   * Get User Matches
   * Retrieves all matches for a user from AI service
   */
  async getUserMatches(userId: string, similarityThreshold?: number): Promise<UserMatchesResponse> {
    return this.executeWithResilience(
      () => this.userService.getUserMatches(userId, similarityThreshold),
      'getUserMatches',
    );
  }

  /**
   * Get Matching Stats
   * Retrieves matching system statistics
   */
  async getMatchingStats(): Promise<MatchingStatsResponse> {
    return this.executeWithResilience(
      () => this.userService.getMatchingStats(),
      'getMatchingStats',
    );
  }

  // ==========================================
  // Admin Dashboard Diagnostics
  // System health, matching diagnostics
  // ==========================================

  /**
   * Get System Health
   * Returns comprehensive health status of all AI components
   */
  async getSystemHealth(): Promise<any> {
    return this.executeWithResilience(
      () => this.userService.getSystemHealth(),
      'getSystemHealth',
      false, // May take longer, no timeout
    );
  }

  /**
   * Get Matching Diagnostics
   * Returns all users with their matching parameters
   */
  async getMatchingDiagnostics(): Promise<any> {
    return this.executeWithResilience(
      () => this.userService.getMatchingDiagnostics(),
      'getMatchingDiagnostics',
      false, // May take longer for large user base
    );
  }

  /**
   * Get Admin User List
   * Returns list of all users with status
   */
  async getAdminUserList(): Promise<any> {
    return this.executeWithResilience(
      () => this.userService.getAdminUserList(),
      'getAdminUserList',
    );
  }

  /**
   * Get Wiring Audit
   * Truth-based health check for the latest completed user
   */
  async getWiringAudit(): Promise<any> {
    return this.executeWithResilience(
      () => this.userService.getWiringAudit(),
      'getWiringAudit',
      false, // May take longer for DB queries
    );
  }

  /**
   * Regenerate Embeddings
   * Triggers embedding regeneration for a user (admin operation)
   */
  async regenerateEmbeddings(userId: string): Promise<any> {
    return this.executeWithResilience(
      () => this.userService.regenerateEmbeddings(userId),
      'regenerateEmbeddings',
      false, // May take longer for embedding generation
    );
  }
}
