export enum GenderEnum {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum OnboardingStatusEnum {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum ProviderEnum {
  PASSWORD = 'password',
  GOOGLE = 'google',
  APPLE = 'apple',
}

export enum SummaryStatusEnum {
  DRAFT = 'draft',
  APPROVED = 'approved',
}

export enum MatchBatchStatusEnum {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum MatchStatusEnum {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
}

/**
 * Match quality tier based on compatibility score
 * Phase 2.3: Tiered Match Badges
 */
export enum MatchTierEnum {
  PERFECT = 'perfect', // 85%+
  STRONG = 'strong', // 70-84%
  WORTH_EXPLORING = 'worth_exploring', // 55-69%
  LOW = 'low', // <55%
}

export enum DecideMatchEnum {
  APPROVED = 'approved',
  DECLINED = 'declined',
}

export enum SubStatusEnum {
  ALL = 'all',
  AWAITING_OTHER = 'awaiting_other',
  APPROVED = 'approved',
  PASSED_BY_ME = 'passed_by_me',
  PASSED_BY_OTHER = 'passed_by_other',
  PASSED = 'passed',
}

export enum AgentReviewStatusEnum {
  APPROVED = 'approved',
  DECLINED = 'declined',
}

export enum AgnetReviewSubStatusEnum {
  ALL = 'all',
}

export enum ConversationStatusEnum {
  OPEN = 'open',
  DELETED = 'deleted',
}

export enum RoleEnum {
  ADMIN = 'admin',
  USER = 'user',
}

export enum CodeTypeEnum {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'password_reset',
}

/**
 * Match feedback reason tags
 * Phase 2.1: Feedback Learning Loop
 * Aligned with frontend FeedbackReasonTag type
 */
export enum FeedbackReasonTagEnum {
  WRONG_INDUSTRY = 'wrong_industry',
  WRONG_STAGE = 'wrong_stage',
  BAD_TIMING = 'bad_timing',
  NOT_RELEVANT = 'not_relevant',
  ALREADY_CONNECTED = 'already_connected',
  TOO_SIMILAR = 'too_similar',
  TOO_DIFFERENT = 'too_different',
  LOCATION_MISMATCH = 'location_mismatch',
  OTHER = 'other',
}

/**
 * User preference types for learned patterns
 * Phase 2.1: Feedback Learning Loop
 */
export enum PreferenceTypeEnum {
  INDUSTRY = 'industry',
  ROLE = 'role',
  SENIORITY = 'seniority',
  GEOGRAPHY = 'geography',
  OBJECTIVE = 'objective',
  COMPANY_SIZE = 'company_size',
  EXPERIENCE_YEARS = 'experience_years',
}

export enum UserActivityEventsEnum {
  SIGN_UP = 'Signed Up', // done
  SIGN_IN = 'Signed In', // done
  SIGN_OUT = 'Signed Out', // done
  EMAIL_VERIFIED = 'Email Verified', // done
  UPDATE_PASSWORD = 'Updated Password', // done
  RESET_PASSWORD = 'Reset Password', // done
  REQUESTED_VERIFICATION_CODE = 'Requested Verification Code', // done
  UPDATE_PROFILE = 'Updated Profile', // done
  ONBOARDING_RESET = 'Reset Onboarding', // done
  ONBOARDING_SUBMISSION = 'Submitted Onboarding Question', // done
  ONBOARDING_UPDATE = 'Updated Onboarding Question', // done
  AI_SUMMARY_REQUESTED = 'Requested AI Summary', // done
  AI_SUMMARY_APPROVED = 'Updated The Persona', // done
  ONBOARDING_COMPLETED = 'Completed Onboarding', // done
  AI_TO_AI_CONVERSATION_INITIATED = 'Initiated AI-to-AI Conversation',
  NEW_MATCH_FOUND = 'New Match Found', // done
  NEW_MATCHES_FOUND = 'New Matches Found', // done
  USER_TO_USER_CONVERSATION_INITIATED = 'Initiated User-to-User Conversation', // done
}
