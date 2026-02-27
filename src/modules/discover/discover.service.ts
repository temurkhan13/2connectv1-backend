import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { User } from 'src/common/entities/user.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { ConnectionInterest, ConnectionInterestStatusEnum } from 'src/common/entities/connection-interest.entity';
import { BrowseHistory } from 'src/common/entities/browse-history.entity';
import { Match } from 'src/common/entities/match.entity';
import {
  SearchProfilesDto,
  ExpressInterestDto,
  BrowseProfileDto,
  MyInterestsDto,
  AnonymousProfileDto,
  InterestResponseDto,
} from './dto/discover.dto';

/**
 * Discover Service
 * Phase 3.3: Interactive Search/Browse
 */
@Injectable()
export class DiscoverService {
  private readonly logger = new Logger(DiscoverService.name);

  constructor(
    @InjectModel(User) private userModel: typeof User,
    @InjectModel(UserSummaries) private userSummariesModel: typeof UserSummaries,
    @InjectModel(ConnectionInterest) private connectionInterestModel: typeof ConnectionInterest,
    @InjectModel(BrowseHistory) private browseHistoryModel: typeof BrowseHistory,
    @InjectModel(Match) private matchModel: typeof Match,
    private sequelize: Sequelize,
  ) {}

  /**
   * Search for anonymous profiles
   */
  async searchProfiles(
    userId: string,
    dto: SearchProfilesDto,
  ): Promise<{ profiles: AnonymousProfileDto[]; total: number; page: number; limit: number }> {
    const { query, objectives, industries, urgency, page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    this.logger.log(`Search params: query="${query}", urgency="${urgency}", page=${page}, limit=${limit}`);

    // Get user's existing matches and interests to exclude
    const existingConnections = await this.getExistingConnections(userId);

    // Build where clause
    const whereClause: any = {
      id: {
        [Op.notIn]: [userId, ...existingConnections],
      },
      onboarding_status: 'completed',
      is_active: true,
      // Filter out test accounts from discover results
      is_test: false,
    };

    // Build summary where clause for filters - use Op.and to combine conditions properly
    const summaryConditions: any[] = [];

    // Apply urgency filter
    if (urgency) {
      summaryConditions.push({ urgency: urgency });
    }

    // Apply text query filter (searches summary text)
    // Split query into words and search for ANY word (fuzzy search)
    if (query && query.trim()) {
      const searchTerm = query.trim();
      // Split on spaces, filter out short words (less than 2 chars)
      const words = searchTerm
        .split(/\s+/)
        .filter((word) => word.length >= 2);

      this.logger.log(
        `Applying search filter for: "${searchTerm}" (words: ${words.join(', ')})`,
      );

      if (words.length > 0) {
        // Search for ANY word in the summary (OR logic for better recall)
        summaryConditions.push({
          [Op.or]: words.map((word) => ({
            summary: { [Op.iLike]: `%${word}%` },
          })),
        });
      }
    }

    // Apply objectives filter (OR condition - match any objective)
    if (objectives && objectives.length > 0) {
      summaryConditions.push({
        [Op.or]: objectives.map(obj => ({
          summary: { [Op.iLike]: `%${obj}%` },
        })),
      });
    }

    // Apply industries filter (OR condition - match any industry)
    // Expand each industry to include related terms for better matching
    if (industries && industries.length > 0) {
      const industryTerms = this.expandIndustryTerms(industries);
      summaryConditions.push({
        [Op.or]: industryTerms.map(term => ({
          summary: { [Op.iLike]: `%${term}%` },
        })),
      });
    }

    // Build the final where clause for summaries
    const summaryWhereClause: any =
      summaryConditions.length > 0 ? { [Op.and]: summaryConditions } : {};

    // FIX: Check summaryConditions.length directly, not Object.keys()
    // Object.keys() doesn't enumerate Symbol keys like Op.and
    const hasFilters = summaryConditions.length > 0;
    this.logger.log(`Search: query="${query}", urgency="${urgency}", hasFilters=${hasFilters}`);

    // Query users with summaries
    const { count, rows } = await this.userModel.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: UserSummaries,
          as: 'userSummaries',
          where: hasFilters ? summaryWhereClause : undefined,
          required: true,
        },
      ],
      limit,
      offset,
      order: [
        [{ model: UserSummaries, as: 'userSummaries' }, 'freshness_score', 'DESC'],
        ['created_at', 'DESC'],
      ],
    });

    this.logger.log(`Search returned ${count} profiles (page ${page}, showing ${rows.length})`);

    // Get current user's summary for compatibility calculation
    const currentUserSummary = await this.userSummariesModel.findOne({
      where: { user_id: userId },
    });

    // Transform to anonymous profiles with compatibility hints
    const profiles: AnonymousProfileDto[] = rows.map((user: any) => {
      const summary = user.userSummaries?.[0];
      const compatibilityHint = this.calculateCompatibility(
        currentUserSummary,
        summary,
      );
      return {
        id: user.id,
        display_name: `Member #${user.id.substring(0, 8).toUpperCase()}`,
        profile_summary: this.anonymizeSummary(summary?.summary || ''),
        objectives: [], // Would extract from onboarding answers
        urgency: summary?.urgency || 'ongoing',
        freshness_score: summary?.freshness_score || 0.5,
        member_since: user.created_at,
        last_active_at: summary?.last_active_at || user.updated_at,
        compatibility_hint: compatibilityHint,
      };
    });

    return {
      profiles,
      total: count,
      page,
      limit,
    };
  }

  /**
   * Express interest in a profile
   */
  async expressInterest(
    fromUserId: string,
    dto: ExpressInterestDto,
  ): Promise<InterestResponseDto> {
    const { to_user_id, message } = dto;

    // Can't express interest in yourself
    if (fromUserId === to_user_id) {
      throw new BadRequestException('Cannot express interest in yourself');
    }

    // Check if target user exists
    const targetUser = await this.userModel.findByPk(to_user_id);
    if (!targetUser) {
      throw new BadRequestException('User not found');
    }

    // Check if already have an interest
    const existingInterest = await this.connectionInterestModel.findOne({
      where: { from_user_id: fromUserId, to_user_id },
    });

    if (existingInterest) {
      return {
        interest_id: existingInterest.id,
        status: existingInterest.status,
      };
    }

    // Check if they already expressed interest in us (mutual!)
    const reverseInterest = await this.connectionInterestModel.findOne({
      where: { from_user_id: to_user_id, to_user_id: fromUserId },
    });

    return await this.sequelize.transaction(async (transaction) => {
      // Create our interest
      const interest = await this.connectionInterestModel.create(
        {
          from_user_id: fromUserId,
          to_user_id,
          message,
          status: reverseInterest
            ? ConnectionInterestStatusEnum.MUTUAL
            : ConnectionInterestStatusEnum.PENDING,
          expires_at: reverseInterest
            ? null
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
        { transaction },
      );

      let matchCreated = false;
      let matchId: string | undefined;

      // If mutual interest, update the other interest and create a match
      if (reverseInterest) {
        await reverseInterest.update(
          { status: ConnectionInterestStatusEnum.MUTUAL },
          { transaction },
        );

        // Create a match for mutual interests
        const match = await this.matchModel.create(
          {
            user_a_id: fromUserId,
            user_b_id: to_user_id,
            status: 'pending',
            match_date: new Date(),
            explanation: {
              source: 'mutual_interest',
              message: 'You both expressed interest in connecting!',
            },
          },
          { transaction },
        );

        matchCreated = true;
        matchId = match.id;
      }

      return {
        interest_id: interest.id,
        status: interest.status,
        match_created: matchCreated,
        match_id: matchId,
      };
    });
  }

  /**
   * Record a profile browse/view
   */
  async recordBrowse(viewerId: string, dto: BrowseProfileDto): Promise<void> {
    await this.browseHistoryModel.create({
      viewer_id: viewerId,
      viewed_user_id: dto.viewed_user_id,
      view_duration_seconds: dto.view_duration_seconds,
      source: dto.source,
    });
  }

  /**
   * Get user's interests (sent, received, or mutual)
   */
  async getMyInterests(
    userId: string,
    dto: MyInterestsDto,
  ): Promise<{ interests: any[]; total: number; page: number; limit: number }> {
    const { type = 'sent', page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    let whereClause: any;
    let includeUser: string;

    switch (type) {
      case 'sent':
        whereClause = { from_user_id: userId };
        includeUser = 'to_user';
        break;
      case 'received':
        whereClause = { to_user_id: userId };
        includeUser = 'from_user';
        break;
      case 'mutual':
        whereClause = {
          [Op.or]: [{ from_user_id: userId }, { to_user_id: userId }],
          status: ConnectionInterestStatusEnum.MUTUAL,
        };
        includeUser = 'both';
        break;
    }

    const { count, rows } = await this.connectionInterestModel.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'from_user',
          attributes: ['id', 'name', 'profile_status'],
        },
        {
          model: User,
          as: 'to_user',
          attributes: ['id', 'name', 'profile_status'],
        },
      ],
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });

    return {
      interests: rows,
      total: count,
      page,
      limit,
    };
  }

  /**
   * Get IDs of users we already have connections with
   */
  private async getExistingConnections(userId: string): Promise<string[]> {
    const [matches, interests] = await Promise.all([
      // Existing matches
      this.matchModel.findAll({
        where: {
          [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }],
        },
        attributes: ['user_a_id', 'user_b_id'],
      }),
      // Existing interests
      this.connectionInterestModel.findAll({
        where: {
          [Op.or]: [{ from_user_id: userId }, { to_user_id: userId }],
        },
        attributes: ['from_user_id', 'to_user_id'],
      }),
    ]);

    const connectedIds = new Set<string>();

    matches.forEach((m: any) => {
      connectedIds.add(m.user_a_id);
      connectedIds.add(m.user_b_id);
    });

    interests.forEach((i: any) => {
      connectedIds.add(i.from_user_id);
      connectedIds.add(i.to_user_id);
    });

    connectedIds.delete(userId);
    return Array.from(connectedIds);
  }

  /**
   * Calculate compatibility score between two user summaries
   * Returns a score from 0-100
   */
  private calculateCompatibility(
    currentUserSummary: UserSummaries | null,
    otherSummary: UserSummaries | null,
  ): number {
    if (!currentUserSummary || !otherSummary) {
      return 50; // Default middle score if data missing
    }

    let score = 0;

    // 1. Urgency alignment (max 25 points)
    const urgencyMap: Record<string, number> = {
      urgent: 4,
      time_sensitive: 3,
      ongoing: 2,
      exploratory: 1,
    };
    const currentUrgency = urgencyMap[currentUserSummary.urgency || 'ongoing'] || 2;
    const otherUrgency = urgencyMap[otherSummary.urgency || 'ongoing'] || 2;
    const urgencyDiff = Math.abs(currentUrgency - otherUrgency);
    score += Math.max(0, 25 - urgencyDiff * 8);

    // 2. Freshness score alignment (max 20 points)
    const currentFreshness = currentUserSummary.freshness_score || 0.5;
    const otherFreshness = otherSummary.freshness_score || 0.5;
    const freshnessDiff = Math.abs(currentFreshness - otherFreshness);
    score += Math.max(0, 20 - freshnessDiff * 40);

    // 3. Keyword overlap in summaries (max 40 points)
    const currentKeywords = this.extractKeywords(currentUserSummary.summary || '');
    const otherKeywords = this.extractKeywords(otherSummary.summary || '');
    const overlap = currentKeywords.filter(k => otherKeywords.includes(k));
    const overlapRatio = overlap.length / Math.max(currentKeywords.length, 1);
    score += Math.min(40, Math.round(overlapRatio * 80));

    // 4. Complementary objectives bonus (max 15 points)
    const complementaryPairs = [
      ['fundraising', 'investor'], ['fundraising', 'investment'],
      ['hiring', 'job'], ['hiring', 'career'],
      ['mentor', 'mentee'], ['mentorship', 'learning'],
      ['partnership', 'collaboration'], ['sales', 'buyer'],
    ];
    const allText = (currentUserSummary.summary + ' ' + otherSummary.summary).toLowerCase();
    for (const [a, b] of complementaryPairs) {
      if (allText.includes(a) && allText.includes(b)) {
        score += 15;
        break;
      }
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Expand industry filter values to include related terms
   * This improves matching since summaries may contain variations
   */
  private expandIndustryTerms(industries: string[]): string[] {
    const expansionMap: Record<string, string[]> = {
      healthcare: ['healthcare', 'health', 'medical', 'hospital', 'healthtech', 'clinical', 'pharma', 'wellness'],
      technology: ['technology', 'tech', 'software', 'digital', 'IT', 'computing'],
      fintech: ['fintech', 'financial technology', 'finance tech', 'banking', 'payments', 'insurtech'],
      ecommerce: ['ecommerce', 'e-commerce', 'online retail', 'marketplace', 'shopping', 'retail tech'],
      saas: ['saas', 'software as a service', 'cloud software', 'subscription software', 'b2b software'],
      ai_ml: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'data science'],
      biotech: ['biotech', 'biotechnology', 'life sciences', 'pharmaceutical', 'drug discovery', 'genomics'],
      real_estate: ['real estate', 'property', 'proptech', 'housing', 'commercial property'],
      education: ['education', 'edtech', 'learning', 'training', 'ed-tech', 'e-learning'],
      media: ['media', 'entertainment', 'content', 'streaming', 'publishing', 'gaming'],
      consulting: ['consulting', 'advisory', 'professional services', 'strategy'],
      manufacturing: ['manufacturing', 'industrial', 'production', 'factory', 'supply chain'],
    };

    const allTerms: string[] = [];
    for (const industry of industries) {
      const key = industry.toLowerCase();
      if (expansionMap[key]) {
        allTerms.push(...expansionMap[key]);
      } else {
        allTerms.push(industry);
      }
    }
    return [...new Set(allTerms)]; // Remove duplicates
  }

  /**
   * Extract keywords from text for matching
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my',
      'your', 'his', 'her', 'its', 'our', 'their', 'am', 'looking', 'want',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
      .slice(0, 20); // Limit to 20 keywords
  }

  /**
   * Anonymize summary to hide identifying details
   * - Detects and handles raw JSON data
   * - Removes test account identifiers and usernames
   * - Removes names, companies, specific amounts
   * - Cleans up newlines and excess whitespace
   * - Removes placeholder artifacts like [Name], [Amount]
   */
  private anonymizeSummary(summary: string): string {
    if (!summary) return '';

    // P0 FIX: Detect raw JSON objects and extract useful content or fallback
    const trimmed = summary.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"')) {
      try {
        const parsed = JSON.parse(trimmed);
        // Try to extract meaningful content from known JSON fields
        const extractedParts: string[] = [];
        if (parsed.industry) extractedParts.push(`Professional in ${parsed.industry}`);
        if (parsed.stage) extractedParts.push(`at ${parsed.stage} stage`);
        if (parsed.goal) extractedParts.push(`focused on ${parsed.goal}`);
        if (parsed.offerings) extractedParts.push(`offering ${parsed.offerings.substring(0, 100)}`);

        if (extractedParts.length > 0) {
          return extractedParts.join(', ') + '.';
        }
        // If no useful fields, return generic fallback
        return 'A professional seeking meaningful connections.';
      } catch {
        // Not valid JSON but starts with { - likely partial/corrupted, use fallback
        if (trimmed.includes('"profile_type"') || trimmed.includes('"industry"')) {
          return 'A professional seeking meaningful connections.';
        }
      }
    }

    // P0 FIX: Detect test account patterns and return generic text
    const lowerSummary = summary.toLowerCase();
    if (
      lowerSummary.startsWith('test ') ||
      lowerSummary.includes('test ai summary') ||
      lowerSummary.includes('ai summary for') ||
      /\btest[._]?\w+\b/.test(lowerSummary) ||  // test.user, test_user, testuser
      /\bfor\s+[a-z]+[._][a-z]+\b/.test(lowerSummary)  // "for john.doe" username patterns
    ) {
      return 'A professional seeking meaningful connections.';
    }

    let anonymized = summary
      // First clean up any raw newlines and normalize whitespace
      .replace(/\\n/g, ' ')           // Escaped newlines
      .replace(/\n/g, ' ')            // Actual newlines
      .replace(/\r/g, ' ')            // Carriage returns
      .replace(/\t/g, ' ')            // Tabs
      .replace(/\s+/g, ' ')           // Multiple spaces to single space
      .trim();

    // Remove internal persona metadata fields that shouldn't be shown to users
    anonymized = anonymized
      // Remove persona field markers and their values (e.g., "Archetype: Founder/Entrepreneur")
      .replace(/\bArchetype:\s*[^.]*\.?/gi, '')
      .replace(/\bDesignation:\s*[^.]*\.?/gi, '')
      .replace(/\bExperience:\s*[^.]*\.?/gi, '')
      .replace(/\bFocus:\s*[^.]*\.?/gi, '')
      .replace(/\bPersona:\s*[^.]*\.?/gi, '')
      .replace(/\bProfile:\s*[^.]*\.?/gi, '')
      // Remove "Not specified" and "Not provided" artifacts
      .replace(/\bNot specified\b/gi, '')
      .replace(/\bNot provided\b/gi, '')
      // Remove markdown-style headers that may leak through (e.g., "## Investment Philosophy")
      .replace(/#+\s*[A-Za-z\s]+/g, '')
      // Remove leading dashes that may appear as bullet points or formatting artifacts
      .replace(/^\s*-+\s*/gm, '')
      .replace(/\s+-+\s+/g, ' ')
      // Clean up after metadata removal
      .replace(/\s+/g, ' ')
      .trim();

    // Remove potential PII - be conservative to avoid breaking content
    anonymized = anonymized
      // P0 FIX: Remove username patterns (word.word, word_word) that reveal identity
      .replace(/\b[a-z]+[._][a-z]+\d*\b/gi, 'a user')
      // P0 FIX: Remove "for [Name]" patterns that reveal identity
      .replace(/\bfor\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?\b/g, '')
      // P0 FIX: Remove "Test" prefix patterns
      .replace(/\bTest\s+(AI\s+)?(summary|user|account|profile)\b/gi, 'Professional')
      // Remove company names with suffixes - include preceding article to avoid "a a company"
      .replace(/\b(a |an |the )?[A-Z][a-zA-Z]+\s+(Inc|LLC|Ltd|Corp|Company|Co)\.?\b/gi, 'a company')
      // Remove dollar amounts but keep context
      .replace(/\$[\d,]+(\.\d{2})?(\s*(million|billion|M|B|K))?/gi, 'significant funding')
      // Remove long numbers (phone, ID, etc.)
      .replace(/\b\d{10,}\b/g, '')
      // Remove email addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '')
      // Remove existing placeholder artifacts that may exist in data
      .replace(/\[Name\]/gi, 'the professional')
      .replace(/\[Company\]/gi, 'their company')
      .replace(/\[Amount\]/gi, 'funding')
      .replace(/\[Number\]/gi, '')
      // Clean up any double spaces created by removals
      .replace(/\s+/g, ' ')
      .trim();

    // Limit length
    if (anonymized.length > 300) {
      // Try to end at a sentence boundary
      const truncated = anonymized.substring(0, 297);
      const lastPeriod = truncated.lastIndexOf('.');
      if (lastPeriod > 200) {
        anonymized = truncated.substring(0, lastPeriod + 1);
      } else {
        anonymized = truncated + '...';
      }
    }

    return anonymized;
  }
}
