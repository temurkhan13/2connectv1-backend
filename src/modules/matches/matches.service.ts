/**
 * Matches Service
 * ---------------
 * Handles all match-related operations by calling the AI service.
 * The AI service owns the matching logic and user data.
 */

import { Injectable, Logger } from '@nestjs/common';
import { AIServiceFacade } from 'src/integration/ai-service/ai-service.facade';
import {
  MatchingStatsResponse,
  MatchResultItem,
} from 'src/integration/ai-service/types/responses.type';

export interface FormattedMatch {
  id: string;
  userId: string;
  name: string;
  userType: string;
  industry: string;
  matchScore: number;
  matchTier: 'perfect' | 'strong' | 'worth_exploring' | 'low';
  explanation: string;
  requirements?: string;
  offerings?: string;
}

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(private readonly aiServiceFacade: AIServiceFacade) {}

  /**
   * Get all matches for a user
   * Calls the AI service to retrieve matches
   */
  async getUserMatches(
    userId: string,
    similarityThreshold?: number,
  ): Promise<{ matches: FormattedMatch[]; total: number }> {
    this.logger.log(`Getting matches for user: ${userId}`);

    const response = await this.aiServiceFacade.getUserMatches(
      userId,
      similarityThreshold,
    );

    // Combine and deduplicate matches from both requirements and offerings
    const matchMap = new Map<string, FormattedMatch>();

    // Process requirements matches (users who can fulfill what I need)
    for (const match of response.requirements_matches || []) {
      const formatted = this.formatMatch(match, 'requirements');
      if (!matchMap.has(match.user_id) || formatted.matchScore > matchMap.get(match.user_id)!.matchScore) {
        matchMap.set(match.user_id, formatted);
      }
    }

    // Process offerings matches (users who need what I offer)
    for (const match of response.offerings_matches || []) {
      const formatted = this.formatMatch(match, 'offerings');
      if (!matchMap.has(match.user_id) || formatted.matchScore > matchMap.get(match.user_id)!.matchScore) {
        matchMap.set(match.user_id, formatted);
      }
    }

    // Sort by match score descending
    const matches = Array.from(matchMap.values()).sort(
      (a, b) => b.matchScore - a.matchScore,
    );

    return {
      matches,
      total: matches.length,
    };
  }

  /**
   * Get requirements matches only
   * Users whose offerings match what I need
   */
  async getRequirementsMatches(
    userId: string,
    similarityThreshold?: number,
  ): Promise<FormattedMatch[]> {
    const response = await this.aiServiceFacade.getUserMatches(
      userId,
      similarityThreshold,
    );

    return (response.requirements_matches || []).map((m) =>
      this.formatMatch(m, 'requirements'),
    );
  }

  /**
   * Get offerings matches only
   * Users who need what I can offer
   */
  async getOfferingsMatches(
    userId: string,
    similarityThreshold?: number,
  ): Promise<FormattedMatch[]> {
    const response = await this.aiServiceFacade.getUserMatches(
      userId,
      similarityThreshold,
    );

    return (response.offerings_matches || []).map((m) =>
      this.formatMatch(m, 'offerings'),
    );
  }

  /**
   * Get matching system statistics
   */
  async getMatchingStats(): Promise<MatchingStatsResponse> {
    return this.aiServiceFacade.getMatchingStats();
  }

  /**
   * Format a match result for the frontend
   */
  private formatMatch(
    match: MatchResultItem,
    matchType: 'requirements' | 'offerings',
  ): FormattedMatch {
    const score = match.similarity_score || 0;

    return {
      id: `${match.user_id}-${matchType}`,
      userId: match.user_id,
      name: match.name || 'Anonymous User',
      userType: match.user_type || 'Professional',
      industry: match.industry || 'General',
      matchScore: Math.round(score * 100) / 100,
      matchTier: this.computeMatchTier(score),
      explanation:
        match.explanation ||
        (matchType === 'requirements'
          ? 'This user can help with what you need'
          : 'This user needs what you can offer'),
      requirements: match.requirements,
      offerings: match.offerings,
    };
  }

  /**
   * Compute match tier from score
   */
  private computeMatchTier(
    score: number,
  ): 'perfect' | 'strong' | 'worth_exploring' | 'low' {
    if (score >= 0.85) return 'perfect';
    if (score >= 0.7) return 'strong';
    if (score >= 0.55) return 'worth_exploring';
    return 'low';
  }
}
