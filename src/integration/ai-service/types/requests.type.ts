/**
 * AI Service Request Types
 * -------------------------
 * Type definitions for all AI service request payloads
 */

/**
 * User Registration Request
 * POST /user/register
 */
export interface UserRegisterRequest {
  update: boolean;
  user_id: string;
  resume_link: string;
  questions: Array<{
    prompt: string;
    answer: string | Record<string, any>;
  }>;
}

/**
 * Approve Summary Request
 * POST /user/approve-summary
 */
export interface ApproveSummaryRequest {
  user_id: string;
}

/**
 * Initiate AI Chat Request
 * POST /user/initiate-ai-chat
 */
export interface InitiateAIChatRequest {
  initiator_id: string;
  responder_id: string;
  match_id: string;
  template?: string | null;
}

/**
 * User Feedback Request
 * POST /user/feedback
 */
export interface UserFeedbackRequest {
  user_id: string;
  type: 'match' | 'chat';
  id: string;
  feedback: string;
}

// Option object used in questions
export interface QuestionOption {
  label: string;
  value: string;
}

// Previous answered question structure
export interface PreviousUserResponse {
  question_id: string; // UUID of previous question
  ai_text: string; // AI generated text
  prompt: string; // Question prompt
  description?: string; // Optional description
  narration?: string; // Optional narration
  suggestion_chips?: string; // Optional suggestion chips
  options?: QuestionOption[]; // Options shown to user
  user_response: string; // User selected value
}

// Main request payload interface
export interface ModifyQuestionTextRequest {
  previous_user_response: PreviousUserResponse[]; // History of answers

  question_id: string; // Current question ID
  code: string; // Question code (e.g. gender)
  prompt: string; // Current question prompt
  description?: string; // Optional description
  narration?: string; // Optional narration
  suggestion_chips?: string; // Optional chips
  options?: QuestionOption[]; // Current question options
}

/**
 * Single option for a question
 */
export interface QuestionOption {
  label: string;
  value: string;
}

/**
 * Payload sent when user answers a question
 */
export interface predictAnswerPayload {
  options?: QuestionOption[];
  // options shown to the user (optional, useful for validation)

  user_response: string;
  // actual response submitted by user
}

/**
 * Match Explanation Request
 * POST /match/explanation
 * Phase 1.1: Match Explanation UI
 */
export interface MatchExplanationRequest {
  match_id: string;
  user_a_id: string;
  user_b_id: string;
  force_refresh?: boolean;
}

/**
 * Ice Breakers Request
 * POST /match/ice-breakers
 * Phase 1.2: Guided First Message
 */
export interface IceBreakersRequest {
  match_id: string;
  user_id: string;
  other_user_id: string;
  context?: {
    synergy_areas?: string[];
    talking_points?: string[];
  };
}

/**
 * Match Feedback with Reasons Request
 * POST /user/feedback-with-reasons
 * Phase 2.1: Feedback Learning Loop
 */
export interface MatchFeedbackWithReasonsRequest {
  user_id: string;
  match_id: string;
  decision: 'approved' | 'declined';
  reason_tags?: string[];
  reason_text?: string;
  decision_time_ms?: number;
  other_user_attributes?: Record<string, any>;
}

// ==========================================
// Conversational Onboarding Request Types
// Dynamic Slot-Filling, Multi-Turn Context, Progressive Disclosure
// ==========================================

/**
 * Start Onboarding Session Request
 * POST /onboarding/start
 */
export interface OnboardingStartRequest {
  user_id: string;
  objective?: string; // User's primary objective if known
}

/**
 * Onboarding Chat Message Request
 * POST /onboarding/chat
 */
export interface OnboardingChatRequest {
  user_id: string;
  message: string;
  session_id?: string; // Creates new session if not provided
}

/**
 * Complete Onboarding Request
 * POST /onboarding/complete
 */
export interface OnboardingCompleteRequest {
  session_id: string;
  user_id: string;
}
