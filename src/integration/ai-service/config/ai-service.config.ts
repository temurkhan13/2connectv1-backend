/**
 * AI Service Configuration
 * -------------------------
 * Centralized configuration for AI service integration
 */

export interface AIServiceConfig {
  baseURL: string;
  apiKey: string;
  timeout: number;
}

/**
 * Load and validate AI service configuration from environment
 */
export function loadAIServiceConfig(): AIServiceConfig {
  const baseURL = process.env.AI_SERVICE_URL;
  const apiKey = process.env.AI_SERVICE_API_KEY;

  if (!baseURL) {
    throw new Error('AI_SERVICE_URL environment variable is required');
  }

  if (!apiKey) {
    throw new Error('AI_SERVICE_API_KEY environment variable is required');
  }

  return {
    baseURL: baseURL.replace(/\/$/, ''), // Remove trailing slash
    apiKey,
    timeout: parseInt(process.env.AI_SERVICE_TIMEOUT || '10000', 10),
  };
}
