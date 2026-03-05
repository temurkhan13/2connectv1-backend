/**
 * AI Service - User Operations
 * -----------------------------
 * Handles all user-related AI service operations
 */

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { AIServiceHttpClient } from 'src/integration/ai-service/services/http.service';
import { AI_SERVICE_ENDPOINTS } from 'src/integration/ai-service/constants/endpoints.constant';
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
} from '../types/requests.type';
import {
  UserRegisterResponse,
  ApproveSummaryResponse,
  InitiateAIChatResponse,
  UserFeedbackResponse,
  TriggerMatchCycleResponse,
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
} from '../types/responses.type';

@Injectable()
export class AIUserService {
  private readonly logger = new Logger(AIUserService.name);

  constructor(private readonly httpClient: AIServiceHttpClient) {}

  /**
   * Register User
   * -------------
   * Registers a new user with the AI service and initiates summary creation
   *
   * @param request - User registration payload
   * @returns Promise<UserRegisterResponse>
   * @throws InternalServerErrorException if registration fails
   */
  async registerUser(request: UserRegisterRequest): Promise<UserRegisterResponse> {
    try {
      this.logger.log(`Requesting AI Summary: ${request.user_id}`);

      const response = await this.httpClient.post<UserRegisterResponse>(
        AI_SERVICE_ENDPOINTS.USER.REGISTER,
        request,
      );

      if (response.Code === 200 && response.Result) {
        this.logger.log(`User registered successfully: ${request.user_id}`);
      }
      this.logger.log({ response_from_request_ai_summry_ai_response: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to register user: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to register user with AI service: ${error.message}`,
      );
    }
  }

  /**
   * Approve Summary
   * ---------------
   * Approves a user's AI-generated summary and triggers matching
   *
   * @param request - Approve summary payload
   * @returns Promise<ApproveSummaryResponse>
   * @throws InternalServerErrorException if approval fails
   */
  async approveSummary(request: ApproveSummaryRequest): Promise<ApproveSummaryResponse> {
    try {
      this.logger.log(`Approving AI summary: ${request.user_id}`);

      const response = await this.httpClient.post<ApproveSummaryResponse>(
        AI_SERVICE_ENDPOINTS.USER.APPROVE_SUMMARY,
        request,
      );

      if (response.Code === 200 && response.Result) {
        this.logger.log(`Summary approved successfully: ${request.user_id}`);
      }
      this.logger.log({ response_from_request_approve_summry_ai_response: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to approve summary: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to approve summary with AI service: ${error.message}`,
      );
    }
  }

  /**
   * Initiate AI Chat
   * ----------------
   * Starts an AI-to-AI conversation between two matched users
   *
   * @param request - Chat initiation payload
   * @returns Promise<InitiateAIChatResponse>
   * @throws InternalServerErrorException if chat initiation fails
   */
  async initiateAIChat(request: InitiateAIChatRequest): Promise<InitiateAIChatResponse> {
    try {
      this.logger.log(
        `Initiating AI chat between initiator ${request.initiator_id} and responder ${request.responder_id}`,
      );

      const response = await this.httpClient.post<InitiateAIChatResponse>(
        AI_SERVICE_ENDPOINTS.USER.INITIATE_AI_CHAT,
        request,
      );

      if (response.Code === 200 && response.Result) {
        this.logger.log(`AI chat initiated successfully for match: ${request.match_id}`);
      }
      this.logger.log({ response_from_initiate_ai_chat_ai_response: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to initiate AI chat: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to initiate AI chat: ${error.message}`);
    }
  }

  /**
   * Submit User Feedback
   * --------------------
   * Submits user feedback for matches or chats to improve AI learning
   *
   * @param request - Feedback payload
   * @returns Promise<UserFeedbackResponse>
   * @throws InternalServerErrorException if feedback submission fails
   */
  async submitFeedback(request: UserFeedbackRequest): Promise<UserFeedbackResponse> {
    try {
      this.logger.log(`Submitting ${request.type} feedback for user: ${request.user_id}`);

      const response = await this.httpClient.post<UserFeedbackResponse>(
        AI_SERVICE_ENDPOINTS.USER.FEEDBACK,
        request,
      );

      if (response.Code === 200 && response.Result) {
        this.logger.log(
          `Feedback submitted successfully: ${request.type} ${request.id} by ${request.user_id}`,
        );
      }
      this.logger.log({ response_from_submit_feedback_ai_response: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to submit feedback: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to submit feedback to AI service: ${error.message}`,
      );
    }
  }

  /**
   * Trigger Match Cycle
   * -------------------
   * Calls the AI service to start a new match-cycle.
   */
  async triggerMatchCycle() {
    try {
      this.logger.log(`Starting match cycle`);

      // POST call to AI service
      const response = await this.httpClient.get<TriggerMatchCycleResponse>(
        `${AI_SERVICE_ENDPOINTS.USER.MATCH_CYCLE}`, // this should resolve to '/match-cycle'
      );

      if (response.Code === 200 && response.Result) {
        this.logger.log(`Match cycle started successfully`);
      }
      this.logger.log({ response_from_match_trigger_job_ai_response: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to start match cycle: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to start match cycle: ${error.message}`);
    }
  }

  /**
   * Modify Question Text
   * --------------------
   */
  async modifyQuestionText(
    request: ModifyQuestionTextRequest,
  ): Promise<GenerateQuestionTextResponse> {
    try {
      const response = await this.httpClient.post<GenerateQuestionTextResponse>(
        AI_SERVICE_ENDPOINTS.MODIFY_QUESTION,
        request,
      );
      console.log({ code: response.Code });
      console.log({ result: response.Result });
      if (response.Code === 200 && response.Result) {
        this.logger.log(
          `Question Text Modified Successfully: ${request.prompt} by ${response.ai_text}`,
        );
      }
      this.logger.log({ response_from_modify_question_text_ai_response: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to modify question text: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to modify question text from AI service: ${error.message}`,
      );
    }
  }

  /**
   * Predict Answer
   * --------------------
   */
  async predictAnswer(request: predictAnswerPayload): Promise<PredictAnswerResponseFromAI> {
    try {
      const response = await this.httpClient.post<PredictAnswerResponseFromAI>(
        AI_SERVICE_ENDPOINTS.PREDICT_ANSWER,
        request,
      );
      console.log({ code: response.Code });
      console.log({ result: response.Result });
      if (response.Code === 200 && response.Result) {
        this.logger.log(
          `Answer Prediction call made successfullt: ${request.user_response} => ${response.valid_answer}`,
        );
      }
      this.logger.log({ response_from_predict_answer_ai_response: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to predict answer: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to predict answer from AI service: ${error.message}`,
      );
    }
  }

  /**
   * Get Match Explanation
   * ---------------------
   * Phase 1.1: Match Explanation UI
   * Generates AI explanation for why two users were matched
   *
   * @param request - Match explanation request
   * @returns Promise<MatchExplanationResponse>
   */
  async getMatchExplanation(request: MatchExplanationRequest): Promise<MatchExplanationResponse> {
    try {
      this.logger.log(`Getting match explanation for match: ${request.match_id}`);

      const response = await this.httpClient.post<MatchExplanationResponse>(
        AI_SERVICE_ENDPOINTS.MATCH.EXPLANATION,
        request,
      );

      if (response.Code === 200 && response.Result) {
        this.logger.log(`Match explanation generated successfully: ${request.match_id}`);
      }
      this.logger.log({ response_from_match_explanation_ai_response: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to get match explanation: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to get match explanation from AI service: ${error.message}`,
      );
    }
  }

  /**
   * Get Ice Breakers
   * ----------------
   * Phase 1.2: Guided First Message
   * Generates conversation starters for a match
   *
   * @param request - Ice breakers request
   * @returns Promise<IceBreakersResponse>
   */
  async getIceBreakers(request: IceBreakersRequest): Promise<IceBreakersResponse> {
    try {
      this.logger.log(
        `Getting ice breakers for match: ${request.match_id}, user: ${request.user_id}`,
      );

      const response = await this.httpClient.post<IceBreakersResponse>(
        AI_SERVICE_ENDPOINTS.MATCH.ICE_BREAKERS,
        request,
      );

      if (response.Code === 200 && response.Result) {
        this.logger.log(`Ice breakers generated successfully for match: ${request.match_id}`);
      }
      this.logger.log({ response_from_ice_breakers_ai_response: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to get ice breakers: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to get ice breakers from AI service: ${error.message}`,
      );
    }
  }

  /**
   * Submit Feedback with Reasons
   * ----------------------------
   * Phase 2.1: Feedback Learning Loop
   * Submits structured feedback with reason tags for learning
   *
   * @param request - Feedback with reasons request
   * @returns Promise<MatchFeedbackWithReasonsResponse>
   */
  async submitFeedbackWithReasons(
    request: MatchFeedbackWithReasonsRequest,
  ): Promise<MatchFeedbackWithReasonsResponse> {
    try {
      this.logger.log(
        `Submitting feedback with reasons for match: ${request.match_id}, user: ${request.user_id}`,
      );

      const response = await this.httpClient.post<MatchFeedbackWithReasonsResponse>(
        AI_SERVICE_ENDPOINTS.USER.FEEDBACK_WITH_REASONS,
        request,
      );

      if (response.Code === 200 && response.Result) {
        this.logger.log(
          `Feedback with reasons submitted successfully: ${request.match_id} by ${request.user_id}`,
        );
      }
      this.logger.log({ response_from_feedback_with_reasons_ai_response: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to submit feedback with reasons: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to submit feedback with reasons to AI service: ${error.message}`,
      );
    }
  }

  // ==========================================
  // Conversational Onboarding Methods
  // Dynamic Slot-Filling, Multi-Turn Context, Progressive Disclosure
  // ==========================================

  /**
   * Start Onboarding Session
   * ------------------------
   * Initiates a new conversational onboarding session
   *
   * @param request - Start onboarding request
   * @returns Promise<OnboardingStartResponse>
   */
  async startOnboardingSession(request: OnboardingStartRequest): Promise<OnboardingStartResponse> {
    try {
      this.logger.log(`Starting onboarding session for user: ${request.user_id}`);

      const response = await this.httpClient.post<OnboardingStartResponse>(
        AI_SERVICE_ENDPOINTS.ONBOARDING.START,
        request,
      );

      this.logger.log(`Onboarding session started: ${response.session_id}`);
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to start onboarding session: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to start onboarding session: ${error.message}`,
      );
    }
  }

  /**
   * Onboarding Chat
   * ---------------
   * Sends a chat message in an onboarding session, extracts slots from response
   *
   * @param request - Chat message request
   * @returns Promise<OnboardingChatResponse>
   */
  async onboardingChat(request: OnboardingChatRequest): Promise<OnboardingChatResponse> {
    try {
      this.logger.log(
        `Onboarding chat for user: ${request.user_id}, session: ${request.session_id || 'new'}`,
      );

      const response = await this.httpClient.post<OnboardingChatResponse>(
        AI_SERVICE_ENDPOINTS.ONBOARDING.CHAT,
        request,
      );

      this.logger.log({
        session_id: response.session_id,
        completion_percent: response.completion_percent,
        is_complete: response.is_complete,
        extracted_slots: Object.keys(response.extracted_slots || {}),
      });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to process onboarding chat: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to process onboarding chat: ${error.message}`);
    }
  }

  /**
   * Get Onboarding Progress
   * -----------------------
   * Retrieves progress for an onboarding session
   *
   * @param sessionId - Session ID
   * @returns Promise<OnboardingProgressResponse>
   */
  async getOnboardingProgress(sessionId: string): Promise<OnboardingProgressResponse> {
    try {
      this.logger.log(`Getting onboarding progress for session: ${sessionId}`);

      const response = await this.httpClient.get<OnboardingProgressResponse>(
        `${AI_SERVICE_ENDPOINTS.ONBOARDING.PROGRESS}/${sessionId}`,
      );

      this.logger.log({
        session_id: response.session_id,
        progress_percent: response.progress_percent,
        slots_filled: response.slots_filled,
        is_complete: response.is_complete,
      });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to get onboarding progress: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to get onboarding progress: ${error.message}`);
    }
  }

  /**
   * Finalize Onboarding Session
   * ---------------------------
   * Finalizes an onboarding session and returns collected data
   *
   * @param sessionId - Session ID
   * @returns Promise<OnboardingFinalizeResponse>
   */
  async finalizeOnboarding(sessionId: string): Promise<OnboardingFinalizeResponse> {
    try {
      this.logger.log(`Finalizing onboarding session: ${sessionId}`);

      const response = await this.httpClient.post<OnboardingFinalizeResponse>(
        `${AI_SERVICE_ENDPOINTS.ONBOARDING.FINALIZE}/${sessionId}`,
        {},
      );

      this.logger.log(
        `Onboarding finalized for user: ${response.user_id}, turns: ${response.turn_count}`,
      );
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to finalize onboarding: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to finalize onboarding: ${error.message}`);
    }
  }

  /**
   * Complete Onboarding
   * -------------------
   * Completes onboarding and triggers profile/persona creation
   *
   * @param request - Complete onboarding request
   * @returns Promise<OnboardingCompleteResponse>
   */
  async completeOnboarding(
    request: OnboardingCompleteRequest,
  ): Promise<OnboardingCompleteResponse> {
    try {
      this.logger.log(
        `Completing onboarding for user: ${request.user_id}, session: ${request.session_id}`,
      );

      const response = await this.httpClient.post<OnboardingCompleteResponse>(
        AI_SERVICE_ENDPOINTS.ONBOARDING.COMPLETE,
        request,
      );

      this.logger.log({
        success: response.success,
        user_id: response.user_id,
        profile_created: response.profile_created,
        persona_task_id: response.persona_task_id,
      });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to complete onboarding: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to complete onboarding: ${error.message}`);
    }
  }

  // ==========================================
  // Matching Methods
  // Get matches from AI service
  // ==========================================

  /**
   * Get User Matches
   * ----------------
   * Retrieves all matches for a user from the AI service
   *
   * @param userId - User ID
   * @param similarityThreshold - Optional minimum similarity score (0.0 to 1.0)
   * @returns Promise<UserMatchesResponse>
   */
  async getUserMatches(userId: string, similarityThreshold?: number): Promise<UserMatchesResponse> {
    try {
      this.logger.log(`Getting matches for user: ${userId}`);

      let endpoint = `${AI_SERVICE_ENDPOINTS.MATCHING.USER_MATCHES}/${userId}/matches`;
      if (similarityThreshold !== undefined) {
        endpoint += `?similarity_threshold=${similarityThreshold}`;
      }

      const response = await this.httpClient.get<UserMatchesResponse>(endpoint);

      this.logger.log({
        user_id: userId,
        requirements_matches: response.requirements_matches?.length || 0,
        offerings_matches: response.offerings_matches?.length || 0,
        total_matches: response.total_matches,
      });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to get user matches: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to get user matches from AI service: ${error.message}`,
      );
    }
  }

  /**
   * Get Matching Stats
   * ------------------
   * Retrieves matching system statistics
   *
   * @returns Promise<MatchingStatsResponse>
   */
  async getMatchingStats(): Promise<MatchingStatsResponse> {
    try {
      this.logger.log('Getting matching stats');

      const response = await this.httpClient.get<MatchingStatsResponse>(
        AI_SERVICE_ENDPOINTS.MATCHING.STATS,
      );

      this.logger.log({ matching_stats: response });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to get matching stats: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to get matching stats from AI service: ${error.message}`,
      );
    }
  }

  // ==========================================
  // Admin Dashboard Diagnostics
  // System health, matching diagnostics
  // ==========================================

  /**
   * Get System Health
   * -----------------
   * Returns comprehensive health status of all AI components
   *
   * @returns Promise<any> - System health status
   */
  async getSystemHealth(): Promise<any> {
    try {
      this.logger.log('Getting system health status');

      const response = await this.httpClient.get<any>(AI_SERVICE_ENDPOINTS.ADMIN.SYSTEM_HEALTH);

      this.logger.log({ system_health: response.overall_status });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to get system health: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to get system health from AI service: ${error.message}`,
      );
    }
  }

  /**
   * Get Matching Diagnostics
   * ------------------------
   * Returns all users with their matching parameters
   *
   * @returns Promise<any> - Matching diagnostics for all users
   */
  async getMatchingDiagnostics(): Promise<any> {
    try {
      this.logger.log('Getting matching diagnostics');

      const response = await this.httpClient.get<any>(
        AI_SERVICE_ENDPOINTS.ADMIN.MATCHING_DIAGNOSTICS,
      );

      this.logger.log({ total_users: response.result?.length || 0 });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to get matching diagnostics: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to get matching diagnostics from AI service: ${error.message}`,
      );
    }
  }

  /**
   * Get Admin User List
   * -------------------
   * Returns list of all users with status
   *
   * @returns Promise<any> - User list with status
   */
  async getAdminUserList(): Promise<any> {
    try {
      this.logger.log('Getting admin user list');

      const response = await this.httpClient.get<any>(AI_SERVICE_ENDPOINTS.ADMIN.LIST_USERS);

      this.logger.log({ total_users: response.result?.length || 0 });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to get admin user list: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to get admin user list from AI service: ${error.message}`,
      );
    }
  }

  /**
   * Get Wiring Audit
   * ----------------
   * Returns truth-based health check for the latest completed user
   *
   * @returns Promise<any> - Wiring audit results
   */
  async getWiringAudit(): Promise<any> {
    try {
      this.logger.log('Getting wiring audit');

      const response = await this.httpClient.get<any>(AI_SERVICE_ENDPOINTS.ADMIN.WIRING_AUDIT);

      this.logger.log({ wiring_audit_status: response.overall_status });
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to get wiring audit: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to get wiring audit from AI service: ${error.message}`,
      );
    }
  }

  /**
   * Regenerate Embeddings
   * ---------------------
   * Triggers embedding regeneration for a user (admin operation)
   *
   * @param userId - User ID to regenerate embeddings for
   * @returns Promise<any> - Response from AI service
   */
  async regenerateEmbeddings(userId: string): Promise<any> {
    try {
      this.logger.log(`Regenerating embeddings for user: ${userId}`);

      const response = await this.httpClient.post<any>(
        AI_SERVICE_ENDPOINTS.ADMIN.REGENERATE_EMBEDDINGS,
        { user_id: userId },
      );

      this.logger.log(`Embeddings regeneration triggered for user: ${userId}`);
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to regenerate embeddings: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to regenerate embeddings for user ${userId}: ${error.message}`,
      );
    }
  }
}
