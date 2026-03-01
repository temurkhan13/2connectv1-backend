/**
 * AI Service API Endpoints
 * -------------------------
 * All API endpoints are defined here for easy maintenance
 */

export const AI_SERVICE_ENDPOINTS = {
  USER: {
    REGISTER: '/user/register',
    APPROVE_SUMMARY: '/user/approve-summary',
    INITIATE_AI_CHAT: '/user/initiate-ai-chat',
    FEEDBACK: '/user/feedback',
    FEEDBACK_WITH_REASONS: '/user/feedback-with-reasons', // Phase 2.1
    MATCH_CYCLE: '/user/run-scheduled-matchmaking',
  },
  MATCH: {
    EXPLANATION: '/match/explanation',     // Phase 1.1
    ICE_BREAKERS: '/match/ice-breakers',   // Phase 1.2
  },
  MATCHING: {
    USER_MATCHES: '/matching',             // GET /matching/{user_id}/matches
    REQUIREMENTS_MATCHES: '/matching',     // GET /matching/{user_id}/requirements-matches
    OFFERINGS_MATCHES: '/matching',        // GET /matching/{user_id}/offerings-matches
    STATS: '/matching/stats',              // GET /matching/stats
  },
  // Conversational Onboarding - Dynamic Slot-Filling, Multi-Turn Context, Progressive Disclosure
  ONBOARDING: {
    START: '/onboarding/start',            // Start new session
    CHAT: '/onboarding/chat',              // Chat with slot extraction
    PROGRESS: '/onboarding/progress',      // GET /onboarding/progress/{session_id}
    FINALIZE: '/onboarding/finalize',      // POST /onboarding/finalize/{session_id}
    SLOTS: '/onboarding/slots',            // GET /onboarding/slots/{session_id}
    COMPLETE: '/onboarding/complete',      // Complete and create profile
  },
  MODIFY_QUESTION: '/modify-question',
  PREDICT_ANSWER: '/predict-answer',
  WEBHOOKS: {
    SUMMARY_READY: '/webhooks/summary-ready',
    USER_MATCHES_READY: '/webhooks/user-matches-ready',
    MATCHES_READY: '/webhooks/matches-ready',
    AI_CHAT_READY: '/webhooks/ai-chat-ready',
  },
  // Admin Dashboard Diagnostics
  ADMIN: {
    SYSTEM_HEALTH: '/admin/system-health',           // GET - comprehensive health status
    MATCHING_DIAGNOSTICS: '/admin/matching-diagnostics', // GET - all users matching data
    LIST_USERS: '/admin/list-users',                 // GET - user status list
  },
} as const;

export type AIServiceEndpoint = typeof AI_SERVICE_ENDPOINTS;
