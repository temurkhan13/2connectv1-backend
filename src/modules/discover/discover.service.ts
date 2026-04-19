import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { User } from 'src/common/entities/user.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import {
  ConnectionInterest,
  ConnectionInterestStatusEnum,
} from 'src/common/entities/connection-interest.entity';
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
import {
  anonymizeForCrossUserView,
  removeSummaryPII,
  parseMarkdownSections,
} from 'src/common/utils/profile-anonymize.util';

// Stop-words excluded from name-stripping (Apr-17 fix).
//
// The discover pipeline strips real names from persona summaries before
// returning them to other users. Historically Source 2 (markdown header
// extraction) split the header on whitespace and stripped every word,
// which caused archetype headers like "# The Executive Tech Talent
// Connector" to obliterate common English words from prose.
//
// This list covers:
//   • Articles / demonstratives / pronouns that could start a header
//   • Role/archetype words used in persona "name" titles by the LLM
//     (persona_name is generated as a creative title, e.g. "The Growth
//     Catalyst", "The Calculated Visionary", "The Emerging Markets
//     Payments Pioneer")
//   • Generic business / tech nouns common in archetype names
//
// Scope: only applied to Source 2 + Source 3 fallbacks. DB first_name/
// last_name always passes (the authoritative signal).
const NAME_STRIP_STOPWORDS = new Set<string>([
  // articles & demonstratives
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  // pronouns that might appear in headers
  'he', 'she', 'they', 'his', 'her', 'their', 'its',
  // archetype / role / descriptive nouns (persona_name is creative-title style)
  'founder', 'investor', 'recruiter', 'mentor', 'advisor', 'executive',
  'entrepreneur', 'professional', 'consultant', 'operator', 'leader',
  'builder', 'strategist', 'specialist', 'expert', 'manager', 'director',
  // qualifier adjectives common in archetype names
  'strategic', 'growth', 'calculated', 'visionary', 'pioneer',
  'connector', 'catalyst', 'emerging', 'global', 'seasoned',
  'senior', 'junior', 'principal', 'technical', 'tech', 'business',
  // industry / domain words
  'fintech', 'healthtech', 'edtech', 'saas', 'enterprise',
  'startup', 'markets', 'payments', 'talent',
  // connectors
  'and', 'or', 'of', 'in', 'for', 'with', 'at', 'on',
]);

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

    this.logger.log(
      `Search params: query="${query}", urgency="${urgency}", page=${page}, limit=${limit}`,
    );

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
      const words = searchTerm.split(/\s+/).filter(word => word.length >= 2);

      this.logger.log(`Applying search filter for: "${searchTerm}" (words: ${words.join(', ')})`);

      if (words.length > 0) {
        // Search for ANY word in the summary (OR logic for better recall)
        summaryConditions.push({
          [Op.or]: words.map(word => ({
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

    // Look up real match scores between current user and all discovered profiles
    const profileIds = rows.map((u: any) => u.id);
    let realMatchScores: Record<string, number> = {};
    try {
      realMatchScores = await this.getRealMatchScores(userId, profileIds);
    } catch (err) {
      this.logger.warn(`Failed to fetch match scores, showing profiles without scores: ${err.message}`);
    }

    // Transform to anonymous profiles with real match scores
    const profiles: AnonymousProfileDto[] = rows.map((user: any) => {
      const summary = user.userSummaries?.[0];
      let summaryText = this.anonymizeSummary(summary?.summary || '');

      // Strip user's real name from the anonymized summary
      //
      // Apr-17 fix: the previous implementation over-stripped prose.
      //   OLD flow: always run Source 2 header extraction, split header by
      //   whitespace, add every token to nameParts. For archetype headers
      //   like "# The Executive Tech Talent Connector" (no "Name — Title"
      //   dash), this added "The", "Executive", "Tech", "Talent", "Connector"
      //   to nameParts → every instance stripped from prose → text became
      //   "This professional brings This professional unusually This
      //   professional credibility..." (6× "This professional" per sentence).
      //
      // NEW flow:
      //   1. Trust DB first_name/last_name when populated (source of truth).
      //   2. Fall back to header extraction ONLY when DB fields missing AND
      //      the header contains the "Name — Title" em-dash (indicating
      //      name-style header, not archetype).
      //   3. Filter header tokens through NAME_STRIP_STOPWORDS to avoid
      //      catastrophic over-strip even on a legitimate "Name" header.
      //   4. Expanded cleanup to catch "This This professional" and other
      //      adjacent-stutter artifacts.
      const nameParts = new Set<string>();

      // Source 1: DB fields (authoritative)
      const firstName = (user.first_name || '').trim();
      const lastName = (user.last_name || '').trim();
      const hasDbName = firstName.length > 1 && lastName.length > 1;
      if (firstName.length > 1) nameParts.add(firstName);
      if (lastName.length > 1) nameParts.add(lastName);

      // Source 2: Fallback — extract name from markdown header only when DB
      // is missing and the header uses "Name — Title" em-dash syntax. Skip
      // entirely for archetype headers like "# The Executive Tech Talent
      // Connector" (no dash, purely descriptive).
      const rawSummary = summary?.summary || '';
      if (!hasDbName) {
        const nameTitleMatch = rawSummary.match(/^#\s+([^—\n]+?)\s+—/m);
        if (nameTitleMatch) {
          const headerName = nameTitleMatch[1].trim();
          for (const part of headerName.split(/\s+/)) {
            const clean = part.replace(/[^a-zA-Z'-]/g, '');
            if (clean.length > 1 && !NAME_STRIP_STOPWORDS.has(clean.toLowerCase())) {
              nameParts.add(clean);
            }
          }
        }
      }

      // Source 3: Check for "Name * description" pattern (legacy format).
      // Stricter regex already requires capitalized-word sequence — low risk.
      const starMatch = rawSummary.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\*/m);
      if (starMatch) {
        for (const part of starMatch[1].trim().split(/\s+/)) {
          if (part.length > 1 && !NAME_STRIP_STOPWORDS.has(part.toLowerCase())) {
            nameParts.add(part);
          }
        }
      }

      // Source 4 (Apr-19 F/u 32 Issue #4): **Name** bold-wrapped first-line
      // headers, optionally preceded by `#`/`##`. Fires only when DB name is
      // missing (matches Source 2's gating) — pre-Fix-#4 personas for users
      // whose `users.first_name`/`last_name` are empty AND whose persona
      // header uses bold-asterisk-name format currently leak the name into
      // Discover because Source 2 requires em-dash `—` and Source 3 requires
      // a trailing single `*`. Real observation: #E782FF7A rendered
      // "**Mehmood Hussain** Focus…" as leading prose. NAME_STRIP_STOPWORDS
      // filters archetype words to prevent over-strip on bold archetypes
      // like `**The Platform Builder**`.
      if (!hasDbName) {
        const boldHeaderMatch = rawSummary.match(/^#*\s*\*\*([^*\n]+?)\*\*/m);
        if (boldHeaderMatch) {
          for (const part of boldHeaderMatch[1].trim().split(/\s+/)) {
            const clean = part.replace(/[^a-zA-Z'-]/g, '');
            if (clean.length > 1 && !NAME_STRIP_STOPWORDS.has(clean.toLowerCase())) {
              nameParts.add(clean);
            }
          }
        }
      }

      // Replace full name first (longest match), then individual parts
      const fullName = `${firstName} ${lastName}`.trim();
      if (fullName.length > 3) {
        summaryText = summaryText.replace(new RegExp(fullName, 'gi'), 'This professional');
      }
      for (const name of nameParts) {
        summaryText = summaryText.replace(new RegExp(`\\b${name}\\b`, 'gi'), 'This professional');
      }

      // Clean up artifacts from mass-substitution:
      //   • "This professional's" → "Their" (possessive)
      //   • "This This professional" → "This professional" (archetype leak)
      //   • "This professional This professional" → "This professional" (adjacent stutter)
      //   • Repeat both stutter cleanups to catch 3+ chains
      //   • Collapse double spaces
      summaryText = summaryText
        .replace(/This professional's/gi, 'Their')
        .replace(/\bThis This professional\b/gi, 'This professional')
        .replace(/\bThis professional This professional\b/gi, 'This professional')
        .replace(/\bThis This professional\b/gi, 'This professional')
        .replace(/\bThis professional This professional\b/gi, 'This professional')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        id: user.id,
        display_name: `Member #${user.id.substring(0, 8).toUpperCase()}`,
        profile_summary: summaryText,
        objectives: this.extractObjectives(summary?.summary || ''),
        urgency: summary?.urgency || 'ongoing',
        freshness_score: summary?.freshness_score || 0.5,
        member_since: user.created_at,
        last_active_at: summary?.last_active_at || user.updated_at,
        compatibility_hint: realMatchScores[user.id] ?? undefined,
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
  async expressInterest(fromUserId: string, dto: ExpressInterestDto): Promise<InterestResponseDto> {
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

    return await this.sequelize.transaction(async transaction => {
      // Create our interest
      const interest = await this.connectionInterestModel.create(
        {
          from_user_id: fromUserId,
          to_user_id,
          message,
          status: reverseInterest
            ? ConnectionInterestStatusEnum.MUTUAL
            : ConnectionInterestStatusEnum.PENDING,
          expires_at: reverseInterest ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
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
      ['fundraising', 'investor'],
      ['fundraising', 'investment'],
      ['hiring', 'job'],
      ['hiring', 'career'],
      ['mentor', 'mentee'],
      ['mentorship', 'learning'],
      ['partnership', 'collaboration'],
      ['sales', 'buyer'],
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
      healthcare: [
        'healthcare',
        'health',
        'medical',
        'hospital',
        'healthtech',
        'clinical',
        'pharma',
        'wellness',
      ],
      technology: ['technology', 'tech', 'software', 'digital', 'IT', 'computing'],
      fintech: [
        'fintech',
        'financial technology',
        'finance tech',
        'banking',
        'payments',
        'insurtech',
      ],
      ecommerce: [
        'ecommerce',
        'e-commerce',
        'online retail',
        'marketplace',
        'shopping',
        'retail tech',
      ],
      saas: [
        'saas',
        'software as a service',
        'cloud software',
        'subscription software',
        'b2b software',
      ],
      ai_ml: [
        'ai',
        'artificial intelligence',
        'machine learning',
        'ml',
        'deep learning',
        'data science',
      ],
      biotech: [
        'biotech',
        'biotechnology',
        'life sciences',
        'pharmaceutical',
        'drug discovery',
        'genomics',
      ],
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
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'can',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'my',
      'your',
      'his',
      'her',
      'its',
      'our',
      'their',
      'am',
      'looking',
      'want',
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
  /**
   * Look up real match scores from the matches table.
   * Returns a map of user_id → score (0-100).
   */
  private async getRealMatchScores(
    currentUserId: string,
    otherUserIds: string[],
  ): Promise<Record<string, number>> {
    if (otherUserIds.length === 0) return {};

    const [rows] = await this.sequelize.query(`
      SELECT
        CASE WHEN user_a_id = :userId THEN user_b_id ELSE user_a_id END as other_id,
        CASE WHEN user_a_id = :userId THEN user_a_persona_compatibility_score ELSE user_b_persona_compatibility_score END as score
      FROM matches
      WHERE (user_a_id = :userId AND user_b_id IN (:otherIds))
         OR (user_b_id = :userId AND user_a_id IN (:otherIds))
    `, {
      replacements: { userId: currentUserId, otherIds: otherUserIds },
    });

    const scoreMap: Record<string, number> = {};
    for (const row of rows as any[]) {
      if (row.score != null) {
        scoreMap[row.other_id] = Math.round(row.score);
      }
    }
    return scoreMap;
  }

  /**
   * Extract objectives from summary markdown for filter chips.
   */
  private extractObjectives(summary: string): string[] {
    if (!summary) return [];
    const sections = parseMarkdownSections(summary);
    const goal = sections['Primary Goal'] || '';
    if (!goal || goal === 'Not specified') return [];

    // Map goal text to standardized objectives
    const objectives: string[] = [];
    const lower = goal.toLowerCase();
    if (lower.includes('fund') || lower.includes('invest') || lower.includes('capital')) objectives.push('Fundraising');
    if (lower.includes('hire') || lower.includes('talent') || lower.includes('recruit')) objectives.push('Hiring');
    if (lower.includes('partner') || lower.includes('collaborat')) objectives.push('Partnership');
    if (lower.includes('mentor')) objectives.push('Mentorship');
    if (lower.includes('job') || lower.includes('role') || lower.includes('career') || lower.includes('opportunity')) objectives.push('Job Search');
    if (lower.includes('co-founder') || lower.includes('cofounder')) objectives.push('Co-founder');
    if (objectives.length === 0) objectives.push(goal.substring(0, 30));
    return objectives;
  }

  /**
   * Apr-18 Follow-up 27: anonymization logic moved to shared util
   * `src/common/utils/profile-anonymize.util.ts` so future cross-user
   * consumers can import the sanctioned function by name instead of
   * having to copy-paste regex logic from this file. See that file's
   * top-of-file JSDoc for when to use vs. when to read raw.
   *
   * These thin wrappers keep the existing callsites working with no
   * behavior change (same input → same output). Do not add new logic
   * here; extend the shared util.
   */
  private anonymizeSummary(summary: string): string {
    return anonymizeForCrossUserView(summary);
  }

  private removePII(text: string): string {
    return removeSummaryPII(text);
  }
}
