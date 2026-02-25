/**
 * AI Service Response Types
 * --------------------------
 * Type definitions for all AI service responses
 */

/**
 * Standard AI Service Response Wrapper
 */
export interface AIServiceResponse<T = any> {
  Code: number;
  Message: string;
  Result: T;
}

/**
 * User Registration Response
 * POST /user/register
 */
export interface UserRegisterResponse extends AIServiceResponse<boolean> {
  Result: boolean;
}

/**
 * Approve Summary Response
 * POST /user/approve-summary
 */
export interface ApproveSummaryResponse extends AIServiceResponse<boolean> {
  Result: boolean;
}

/**
 * Initiate AI Chat Response
 * POST /user/initiate-ai-chat
 */
export interface InitiateAIChatResponse extends AIServiceResponse<boolean> {
  Result: boolean;
}

/**
 * User Feedback Response
 * POST /user/feedback
 */
export interface UserFeedbackResponse extends AIServiceResponse<boolean> {
  Result: boolean;
}

/**
 * Trigger Match Cycle Response
 * POST /match-cycle
 */
export interface TriggerMatchCycleResponse extends AIServiceResponse<boolean> {
  Result: boolean;
}

/**
 * AI Generated Question Text Response
 * Used for onboarding / question generation
 */
export interface GenerateQuestionTextResponse extends AIServiceResponse<boolean> {
  question_id: string; // Question UUID
  ai_text: string; // AI generated markdown / text
  suggestion_chips?: string; // Optional follow-up hint or chip text
}

/**
 * AI response after validating or predicting user answer
 */
export interface PredictAnswerResponseFromAI extends AIServiceResponse<boolean> {
  predicted_answer: string | null;
  // AI guessed or suggested answer (can be null)

  valid_answer: boolean | null;
  // whether user answer is valid (can be null)

  fallback_text: string | null;
  // text to show user if answer is invalid or unclear
}

/**
 * Generic Success Response
 */
export interface SuccessResponse extends AIServiceResponse<boolean> {
  Code: 200;
  Message: 'success';
  Result: true;
}

/**
 * Error Response
 */
export interface ErrorResponse extends AIServiceResponse<null> {
  Code: number;
  Message: string;
  Result: null;
}

/**
 * Score dimension for multi-vector scoring
 * Phase 2.2
 * Matches frontend ScoreDimension interface
 */
export interface ScoreDimensionResponse {
  score: number;
  weight: number;
  weighted_score: number;
  explanation: string;
}

/**
 * Match Explanation Response
 * POST /match/explanation
 * Phase 1.1: Match Explanation UI
 */
export interface MatchExplanationResponse extends AIServiceResponse<boolean> {
  match_id: string;
  summary: string;
  synergy_areas: string[];
  friction_points: string[];
  talking_points: string[];
  overall_score: number;
  match_tier: 'perfect' | 'strong' | 'worth_exploring' | 'low';
  score_breakdown?: {
    objective_alignment: ScoreDimensionResponse;
    industry_match: ScoreDimensionResponse;
    timeline_compatibility: ScoreDimensionResponse;
    skill_complement: ScoreDimensionResponse;
    experience_level: ScoreDimensionResponse;
    communication_style: ScoreDimensionResponse;
  };
}

/**
 * Ice Breakers Response
 * POST /match/ice-breakers
 * Phase 1.2: Guided First Message
 */
export interface IceBreakersResponse extends AIServiceResponse<boolean> {
  match_id: string;
  user_id: string;
  suggestions: string[];
}

/**
 * Match Feedback with Reasons Response
 * POST /user/feedback-with-reasons
 * Phase 2.1: Feedback Learning Loop
 */
export interface MatchFeedbackWithReasonsResponse extends AIServiceResponse<boolean> {
  feedback_id: string;
  learning_triggered: boolean;
}

// ==========================================
// Conversational Onboarding Response Types
// Dynamic Slot-Filling, Multi-Turn Context, Progressive Disclosure
// ==========================================

/**
 * Start Onboarding Session Response
 * POST /onboarding/start
 */
export interface OnboardingStartResponse {
  session_id: string;
  greeting: string;
  suggested_questions: string[];
  progress_percent: number;
}

/**
 * Extracted slot data
 */
export interface ExtractedSlotData {
  value: any;
  confidence: number;
  status?: string;
}

/**
 * Onboarding Chat Response
 * POST /onboarding/chat
 */
export interface OnboardingChatResponse {
  session_id: string;
  ai_response: string;
  extracted_slots: Record<string, ExtractedSlotData>;
  all_slots: Record<string, ExtractedSlotData>;
  completion_percent: number;
  next_questions: string[];
  phase: string;
  is_complete: boolean;
}

/**
 * Onboarding Progress Response
 * GET /onboarding/progress/{session_id}
 */
export interface OnboardingProgressResponse {
  session_id: string;
  user_id: string;
  phase: string;
  progress_percent: number;
  slots_filled: number;
  total_required: number;
  estimated_remaining_minutes: number;
  is_complete: boolean;
}

/**
 * Finalize Session Response
 * POST /onboarding/finalize/{session_id}
 */
export interface OnboardingFinalizeResponse {
  session_id: string;
  user_id: string;
  collected_data: Record<string, any>;
  turn_count: number;
  completed_at: string;
}

/**
 * Complete Onboarding Response
 * POST /onboarding/complete
 */
export interface OnboardingCompleteResponse {
  success: boolean;
  user_id: string;
  message: string;
  profile_created: boolean;
  persona_task_id?: string;
}

// ==========================================
// Matching Response Types
// AI Service matching endpoints
// ==========================================

/**
 * Single match result
 */
export interface MatchResultItem {
  user_id: string;
  similarity_score: number;
  name?: string;
  user_type?: string;
  industry?: string;
  requirements?: string;
  offerings?: string;
  explanation?: string;
}

/**
 * User Matches Response
 * GET /matching/{user_id}/matches
 */
export interface UserMatchesResponse {
  user_id: string;
  requirements_matches: MatchResultItem[];
  offerings_matches: MatchResultItem[];
  total_matches: number;
  threshold_used: number;
}

/**
 * Matching Stats Response
 * GET /matching/stats
 */
export interface MatchingStatsResponse {
  total_users_with_embeddings: number;
  total_requirements_embeddings: number;
  total_offerings_embeddings: number;
  last_updated?: string;
}
