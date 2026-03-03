import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';
import { Match } from 'src/common/entities/match.entity';
import { UserActivityLog } from 'src/common/entities/user-activity-log.entity';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { IceBreaker } from 'src/common/entities/ice-breaker.entity';
import { MatchFeedback } from 'src/common/entities/match-feedback.entity';
import { UserPreferencesLearned } from 'src/common/entities/user-preferences-learned.entity';
import { MailService } from 'src/modules/mail/mail.service';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';
import {
  MatchStatusEnum,
  DecideMatchEnum,
  UserActivityEventsEnum,
  SubStatusEnum,
  MatchTierEnum,
} from 'src/common/enums';
import {
  ListMatchesDto,
  CountMatchesDto,
  ListAgentReviewMatchesDto,
  CountAgentReviewMatchesDto,
} from 'src/modules/dashboard/dto/dashboard.dto';
import { AIServiceFacade } from 'src/integration/ai-service/ai-service.facade';
import { UserFeedbackRequest } from 'src/integration/ai-service/types/requests.type';

const DASHBOARD_ACTIVITY_EVENTS = [
  // Only these types are shown on the dashboard agent activity
  UserActivityEventsEnum.AI_SUMMARY_APPROVED,
  UserActivityEventsEnum.NEW_MATCH_FOUND,
  UserActivityEventsEnum.NEW_MATCHES_FOUND,
  UserActivityEventsEnum.AI_TO_AI_CONVERSATION_INITIATED,
] as const;

type RecentActivityItem = {
  id: string;
  event_type: string;
  event_time: Date;
  metadata: Record<string, any> | null;
  created_at: Date;
};

type RecentActivityResult = {
  items: RecentActivityItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  range: { from: string; to: string }; // ISO strings for clarity
};

// type MatchDecision = 'pending' | 'approved' | 'declined';
// type MatchStatus = 'pending' | 'approved' | 'declined';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  constructor(
    @InjectModel(Match)
    private matchModel: typeof Match,

    @InjectModel(UserActivityLog)
    private userActivityLogModel: typeof UserActivityLog,

    @InjectModel(User)
    private readonly userModel: typeof User,

    @InjectModel(IceBreaker)
    private readonly iceBreakerModel: typeof IceBreaker,

    @InjectModel(MatchFeedback)
    private readonly matchFeedbackModel: typeof MatchFeedback,

    @InjectModel(UserPreferencesLearned)
    private readonly userPreferencesLearnedModel: typeof UserPreferencesLearned,

    //@InjectModel(AiConversation)
    private readonly mailService: MailService,
    private readonly dailyAnalyticsService: DailyAnalyticsService,
    private readonly aiService: AIServiceFacade,
    // Transaction manager
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * getOnboardingMatches
   * --------------------
   * Return matches for dashboard display (up to 4 cards).
   * Priority: pending matches first, then recent actioned matches.
   * Rules (NULL-safe):
   * - Overall status must be 'pending'
   * - If user is A: user_a_decision ∈ {pending, NULL} AND user_b_decision ∈ {pending, approved, NULL}
   * - If user is B: user_b_decision ∈ {pending, NULL} AND user_a_decision ∈ {pending, approved, NULL}
   * Response includes other_user fields from joined users.
   */
  async getOnboardingMatches(userId: string, limit: number = 3) {
    this.logger.log('----- GET ONBOARDING MATCHES -----');
    this.logger.log({ user_id: userId });
    this.logger.log({ timestamp: new Date(Date.now()) });
    // status_label:
    // - 'Pending' (my decision not set / pending)
    // - 'Awaiting Other' (I approved, waiting on other)
    // (Final 'Passed' label does not occur here since overall status is 'pending')
    //
    // mark that user pulled matches (idempotent)
    await this.userModel.update({ onboarding_matches: true }, { where: { id: userId } });

    const uid = this.sequelize.escape(userId);

    const rows = await this.matchModel.findAll({
      where: {
        [Op.and]: [
          { status: MatchStatusEnum.PENDING },
          {
            [Op.or]: [
              // user is A
              {
                [Op.and]: [
                  { user_a_id: userId },
                  {
                    user_a_decision: {
                      [Op.or]: [
                        { [Op.eq]: MatchStatusEnum.PENDING },
                        { [Op.is]: null }, // <-- NULL support
                      ],
                    },
                  },
                  {
                    user_b_decision: {
                      [Op.or]: [
                        { [Op.in]: [MatchStatusEnum.PENDING, MatchStatusEnum.APPROVED] },
                        { [Op.is]: null }, // <-- NULL support
                      ],
                    },
                  },
                ],
              },
              // user is B
              {
                [Op.and]: [
                  { user_b_id: userId },
                  {
                    user_b_decision: {
                      [Op.or]: [
                        { [Op.eq]: MatchStatusEnum.PENDING },
                        { [Op.is]: null }, // <-- NULL support
                      ],
                    },
                  },
                  {
                    user_a_decision: {
                      [Op.or]: [
                        { [Op.in]: [MatchStatusEnum.PENDING, MatchStatusEnum.APPROVED] },
                        { [Op.is]: null }, // <-- NULL support
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      include: [
        { model: this.userModel, as: 'userA', attributes: [] },
        { model: this.userModel, as: 'userB', attributes: [] },
      ],
      attributes: [
        'id',
        ['created_at', 'match_date'],
        'status',
        'user_a_id',
        'user_b_id',
        'user_a_decision',
        'user_b_decision',
        'user_a_feedback',
        'user_b_feedback',
        [
          this.sequelize.literal(
            `CASE 
             WHEN "Match"."user_a_id" = ${uid} THEN "userB"."id"
             ELSE "userA"."id"
           END`,
          ),
          'other_user_id',
        ],
        [
          this.sequelize.literal(
            `CASE 
             WHEN "Match"."user_a_id" = ${uid}
               THEN COALESCE("userB"."first_name",'') || ' ' || COALESCE("userB"."last_name",'')
             ELSE COALESCE("userA"."first_name",'') || ' ' || COALESCE("userA"."last_name",'')
           END`,
          ),
          'other_user_name',
        ],
        [
          this.sequelize.literal(
            `CASE 
             WHEN "Match"."user_a_id" = ${uid} THEN "Match"."user_b_designation"
             ELSE "Match"."user_a_designation"
           END`,
          ),
          'other_user_designation',
        ],
        [
          this.sequelize.literal(
            `CASE
             WHEN "Match"."user_a_id" = ${uid} THEN "userB"."objective"
             ELSE "userA"."objective"
           END`,
          ),
          'other_user_objective',
        ],
        // Include other user's is_test flag to filter out test accounts
        [
          this.sequelize.literal(
            `CASE
             WHEN "Match"."user_a_id" = ${uid} THEN "userB"."is_test"
             ELSE "userA"."is_test"
           END`,
          ),
          'other_user_is_test',
        ],
      ],
      order: [['created_at', 'DESC']],
      raw: true,
      nest: false,
    });

    const totalMatches = await this.matchModel.count({
      where: {
        [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }],
      },
    });

    this.logger.log({ number_of_matches: rows.length });

    // Check if current user is a test account
    const currentUser = await this.userModel.findByPk(userId, { attributes: ['is_test'] });
    const isCurrentUserTest = currentUser?.is_test === true;

    // Filter out test accounts only if current user is NOT a test account
    // (Test accounts can see other test accounts for testing purposes)
    let filteredRows = isCurrentUserTest ? rows : rows.filter((r: any) => !r.other_user_is_test);

    // If fewer than `limit` pending matches, fill with recent actioned matches
    if (filteredRows.length < limit) {
      const pendingIds = filteredRows.map((r: any) => r.id);
      const needed = limit - filteredRows.length;

      const recentActioned = await this.matchModel.findAll({
        where: {
          [Op.and]: [
            { [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }] },
            { status: { [Op.ne]: MatchStatusEnum.PENDING } }, // non-pending
            ...(pendingIds.length > 0 ? [{ id: { [Op.notIn]: pendingIds } }] : []),
          ],
        },
        include: [
          { model: this.userModel, as: 'userA', attributes: [] },
          { model: this.userModel, as: 'userB', attributes: [] },
        ],
        attributes: [
          'id',
          ['created_at', 'match_date'],
          'status',
          'user_a_id',
          'user_b_id',
          'user_a_decision',
          'user_b_decision',
          'user_a_feedback',
          'user_b_feedback',
          [
            this.sequelize.literal(
              `CASE WHEN "Match"."user_a_id" = ${uid} THEN "userB"."id" ELSE "userA"."id" END`,
            ),
            'other_user_id',
          ],
          [
            this.sequelize.literal(
              `CASE WHEN "Match"."user_a_id" = ${uid}
                THEN COALESCE("userB"."first_name",'') || ' ' || COALESCE("userB"."last_name",'')
                ELSE COALESCE("userA"."first_name",'') || ' ' || COALESCE("userA"."last_name",'')
              END`,
            ),
            'other_user_name',
          ],
          [
            this.sequelize.literal(
              `CASE WHEN "Match"."user_a_id" = ${uid} THEN "Match"."user_b_designation" ELSE "Match"."user_a_designation" END`,
            ),
            'other_user_designation',
          ],
          [
            this.sequelize.literal(
              `CASE WHEN "Match"."user_a_id" = ${uid} THEN "userB"."objective" ELSE "userA"."objective" END`,
            ),
            'other_user_objective',
          ],
          [
            this.sequelize.literal(
              `CASE WHEN "Match"."user_a_id" = ${uid} THEN "userB"."is_test" ELSE "userA"."is_test" END`,
            ),
            'other_user_is_test',
          ],
        ],
        order: [['updated_at', 'DESC']],
        limit: needed,
        raw: true,
        nest: false,
      });

      // Filter test accounts and append (skip filter if current user is test account)
      const filteredActioned = isCurrentUserTest
        ? recentActioned
        : recentActioned.filter((r: any) => !r.other_user_is_test);
      filteredRows = [...filteredRows, ...filteredActioned];
    }

    const matches = filteredRows.map((r: any) => {
      // Determine if current user is userA or userB
      const isUserA = r.user_a_id === userId;
      const myDecision = isUserA ? r.user_a_decision : r.user_b_decision;
      // const otherDecision = isUserA ? r.user_b_decision : r.user_a_decision;

      // Compute status_label based on match status and decisions
      let statusLabel = 'Pending';

      if (r.status === MatchStatusEnum.APPROVED) {
        statusLabel = 'Approved';
      } else if (r.status === MatchStatusEnum.DECLINED) {
        // Determine who passed
        const iPassedMatch =
          (isUserA && r.user_a_decision === MatchStatusEnum.DECLINED) ||
          (!isUserA && r.user_b_decision === MatchStatusEnum.DECLINED);
        statusLabel = iPassedMatch ? 'Passed by me' : 'Passed by other';
      } else if (myDecision === MatchStatusEnum.APPROVED) {
        statusLabel = 'Awaiting Other';
      }

      // Compute feedback message based on conditions
      let feedbackMessage = '';
      const userAFeedback = r.user_a_feedback;
      const userBFeedback = r.user_b_feedback;
      const hasFeedback =
        (userAFeedback && userAFeedback.trim()) || (userBFeedback && userBFeedback.trim());

      if (statusLabel === 'Passed') {
        // Both parties declined
        feedbackMessage = 'The match has been Passed by both parties';
      } else if (hasFeedback) {
        // At least one party gave feedback
        feedbackMessage = 'Feedback has been collected';
      } else {
        // No feedback from either side
        feedbackMessage = 'No Feedback was given';
      }

      return {
        id: r.id,
        match_date: r.match_date,
        status: r.status,
        status_label: statusLabel,
        feedback: feedbackMessage,
        other_user: {
          id: r.other_user_id,
          name: String(r.other_user_name || '').trim(),
          designation: r.other_user_designation || null,
          objective: r.other_user_objective || null,
        },
      };
    });

    return {
      matches,
      matches_found: totalMatches > 0 ? true : false,
    };
  }

  /**
   * decideMatch
   * -----------
   * Update caller's decision ('approved' | 'declined') in a transaction.
   * - Validates caller belongs to the match.
   * - Only updates if my decision is NULL/pending.
   * - Recomputes final status:
   *   - if any side declined -> 'declined'
   *   - else if both approved -> 'approved'
   *   - else -> 'pending'
   * - Sends "awaiting response" email when caller approves.
   */
  async decideMatch(
    matchId: string,
    userId: string,
    decision: DecideMatchEnum, // 'approved' | 'declined'
  ) {
    this.logger.log(`----- DECIDE MATCH -----`);
    this.logger.log({ user_id: userId });
    this.logger.log({ decision });

    if (![DecideMatchEnum.APPROVED, DecideMatchEnum.DECLINED].includes(decision)) {
      throw new BadRequestException('decision must be approved or declined');
    }

    return await this.sequelize.transaction(async (tx: Transaction) => {
      // 1) Load the match ensuring the user is a participant
      const match = await this.matchModel.findOne({
        where: { id: matchId, [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }] },
        transaction: tx,
        lock: tx.LOCK.UPDATE, // guard against concurrent updates
      });

      if (!match) throw new BadRequestException('Match not found');

      const isUserA = match.user_a_id === userId;
      this.logger.log({ is_user_a: isUserA });

      const myField = isUserA ? 'user_a_decision' : 'user_b_decision';

      let otherUserId: string;
      let thisUserId: string;
      if (isUserA) {
        otherUserId = match.user_b_id;
        thisUserId = match.user_a_id;
      } else {
        otherUserId = match.user_a_id;
        thisUserId = match.user_b_id;
      }

      // 2) Only allow decision if still pending
      if (
        match[myField] !== MatchStatusEnum.PENDING &&
        match[myField] !== null &&
        match[myField] !== undefined
      ) {
        throw new BadRequestException('You have already submitted your decision for this match');
      }

      // 3) Update my decision, with a conditional WHERE to keep it safe
      const [affected] = await this.matchModel.update(
        { [myField]: decision },
        {
          where: {
            id: matchId,
            [myField]: {
              [Op.or]: [
                { [Op.in]: [MatchStatusEnum.PENDING] },
                { [Op.is]: null }, // <-- NULL support
              ],
            },
          },
          transaction: tx,
        },
      );
      if (affected !== 1) throw new BadRequestException('Failed to update decision');

      // daily analytics entry per user decision
      if (decision === DecideMatchEnum.DECLINED) {
        await this.dailyAnalyticsService.bumpToday('matches_declined', { by: 1, transaction: tx });
      } else if (decision === DecideMatchEnum.APPROVED) {
        await this.dailyAnalyticsService.bumpToday('matches_approved', { by: 1, transaction: tx });
      }

      // 4) Reload to compute overall status using fresh decisions
      const updated = await this.matchModel.findByPk(matchId, {
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });
      if (!updated) throw new BadRequestException('Match not found after update');

      const a = updated.user_a_decision;
      const b = updated.user_b_decision;

      let finalStatus: MatchStatusEnum = updated.status;

      if (a === MatchStatusEnum.DECLINED || b === MatchStatusEnum.DECLINED) {
        finalStatus = MatchStatusEnum.DECLINED;

        // aggregate-level analytics (final match declined)
        await this.dailyAnalyticsService.bumpToday('matches_declined', {
          by: 1,
          transaction: tx,
        });
      } else if (a === MatchStatusEnum.APPROVED && b === MatchStatusEnum.APPROVED) {
        finalStatus = MatchStatusEnum.APPROVED;

        // aggregate-level analytics (final match approved)
        await this.dailyAnalyticsService.bumpToday('matches_approved', {
          by: 1,
          transaction: tx,
        });
      } else {
        finalStatus = MatchStatusEnum.PENDING;
      }

      this.logger.log({ match_status: finalStatus });

      if (finalStatus !== updated.status) {
        await this.matchModel.update(
          { status: finalStatus },
          { where: { id: matchId }, transaction: tx },
        );
      }

      // 5) Send "awaiting response" email ONLY if:
      // - I just approved
      // - Other side has NOT approved yet (still pending / null)
      if (decision === DecideMatchEnum.APPROVED) {
        const otherDecision = isUserA ? b : a; // other side's decision

        const shouldSendAwaitingEmail =
          otherDecision === null ||
          otherDecision === undefined ||
          otherDecision === MatchStatusEnum.PENDING;

        if (shouldSendAwaitingEmail) {
          const otherUser: any = await this.userModel.findOne({
            where: { id: otherUserId },
            attributes: ['email', 'first_name'],
            transaction: tx,
          });

          const thisUser: any = await this.userModel.findOne({
            where: { id: thisUserId },
            attributes: ['first_name'],
            transaction: tx,
          });

          const response = await this.mailService.sendAwaitingResponseEmail(
            otherUser.email,
            otherUser.first_name,
            thisUser.first_name,
          );
          this.logger.log({ response_from_email_deciding_match: response });
        } else {
          this.logger.log(
            'Skipping awaiting-response email because other side has already decided (approved/declined).',
          );
        }
      }

      // 6) Return compact shape
      return {
        id: updated.id,
        status: finalStatus,
        user_a_decision: a,
        user_b_decision: b,
      };
    });
  }

  /**
   * quickStats
   * ----------
   * Returns:
   *  - total_matches: user is in user_a_id OR user_b_id
   *  - approved_matches: status = 'approved'
   *  - conversations: user_to_user_conversation = true
   *  - high_compatibility: match_tier IN ('perfect', 'strong')
   */
  async quickStats(userId: string) {
    this.logger.log(`----- QUICK STATS -----`);
    this.logger.log({ user_id: userId });
    const uid = this.sequelize.escape(userId);

    const row: any = await this.matchModel.findAll({
      where: {
        [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }],
      },
      attributes: [
        // total
        [this.sequelize.fn('COUNT', this.sequelize.literal('*')), 'total_matches'],

        // approved matches (status = 'approved')
        [
          this.sequelize.fn(
            'SUM',
            this.sequelize.literal(`CASE WHEN "Match"."status" = 'approved' THEN 1 ELSE 0 END`),
          ),
          'approved_matches',
        ],

        // conversation true
        [
          this.sequelize.fn(
            'SUM',
            this.sequelize.literal(
              `CASE WHEN "Match"."user_to_user_conversation" IS TRUE THEN 1 ELSE 0 END`,
            ),
          ),
          'conversations',
        ],

        // high_compatibility: match_tier IN ('perfect', 'strong')
        [
          this.sequelize.fn(
            'SUM',
            this.sequelize.literal(
              `CASE WHEN "Match"."match_tier" IN ('perfect', 'strong') THEN 1 ELSE 0 END`,
            ),
          ),
          'high_compatibility',
        ],
      ],
      raw: true, // get a flat object
      nest: false, // not nesting
    });

    // Postgres can return numeric aggregates as strings; cast to numbers.
    return {
      total_matches: Number(row[0]?.total_matches ?? 0),
      approved_matches: Number(row[0]?.approved_matches ?? 0),
      conversations: Number(row[0]?.conversations ?? 0),
      high_compatibility: Number(row[0]?.high_compatibility ?? 0),
    };
  }

  /**
   * aiMatchAnalytics
   * ----------------
   * 6D Matching Metrics:
   *  - avg_match_score: Average persona compatibility score (from match scores)
   *  - response_rate: % of matches where user has decided (not pending)
   *  - connection_rate: % of approved matches that led to conversations
   */
  async aiMatchAnalytics(userId: string) {
    this.logger.log(`----- AI MATCH ANALYTICS -----`);
    this.logger.log({ user_id: userId });
    const uid = this.sequelize.escape(userId);

    // Get per-user aggregates with decision and compatibility scores
    const rows: any[] = await this.matchModel.findAll({
      where: {
        [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }],
      },
      attributes: [
        // total matches for THIS user
        [this.sequelize.fn('COUNT', this.sequelize.literal('*')), 'total'],

        // matches where user has decided (not pending)
        [
          this.sequelize.fn(
            'SUM',
            this.sequelize.literal(
              `CASE WHEN (
                ("Match"."user_a_id" = ${uid} AND "Match"."user_a_decision" IS NOT NULL AND "Match"."user_a_decision" != 'pending')
                OR
                ("Match"."user_b_id" = ${uid} AND "Match"."user_b_decision" IS NOT NULL AND "Match"."user_b_decision" != 'pending')
              ) THEN 1 ELSE 0 END`,
            ),
          ),
          'decided_count',
        ],

        // approved matches count
        [
          this.sequelize.fn(
            'SUM',
            this.sequelize.literal(`CASE WHEN "Match"."status" = 'approved' THEN 1 ELSE 0 END`),
          ),
          'approved_count',
        ],

        // approved matches with user_to_user_conversation = TRUE
        [
          this.sequelize.fn(
            'SUM',
            this.sequelize.literal(
              `CASE WHEN "Match"."status" = 'approved' AND "Match"."user_to_user_conversation" IS TRUE THEN 1 ELSE 0 END`,
            ),
          ),
          'connected_count',
        ],

        // Average persona compatibility score (user's side)
        // BUG-018 FIX: Don't default to 50 when NULL - let AVG() return NULL naturally
        [
          this.sequelize.fn(
            'AVG',
            this.sequelize.literal(
              `CASE
                WHEN "Match"."user_a_id" = ${uid}
                  THEN "Match"."user_a_persona_compatibility_score"
                ELSE "Match"."user_b_persona_compatibility_score"
              END`,
            ),
          ),
          'avg_compat_score',
        ],
      ],
      raw: true,
      nest: false,
    });

    const row = rows?.[0] ?? {};
    const totalUserMatches = Number(row.total ?? 0);
    const decidedCount = Number(row.decided_count ?? 0);
    const approvedCount = Number(row.approved_count ?? 0);
    const connectedCount = Number(row.connected_count ?? 0);
    // BUG-018 FIX: Return 0 when no matches exist (instead of defaulting to 50)
    const avgCompatScore = totalUserMatches > 0 ? Number(row.avg_compat_score ?? 0) : 0;

    // Helpers
    const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Compute 6D metrics
    return {
      total_matches: totalUserMatches,
      // avg_match_score: Average persona compatibility score (0 when no matches)
      avg_match_score: round2(avgCompatScore),
      // response_rate: % of matches decided on (not pending)
      response_rate: round2(pct(decidedCount, totalUserMatches)),
      // connection_rate: % of approved matches that led to conversations
      connection_rate: round2(pct(connectedCount, approvedCount)),
    };
  }

  /**
   * Save feedback for a match from the calling user.
   * - Looks up the match by match_id
   * - Detects if the user is user_a or user_b
   * - Updates the correct feedback column (user_a_feedback or user_b_feedback)
   * - Sends feedback to AI service for learning and persona refinement
   *
   * @param userId   UUID of the user giving feedback
   * @param matchId  UUID of the match
   * @param feedback Free-text feedback (non-empty)
   * @returns the updated match (plain object)
   */
  async submitMatchFeedback(userId: string, matchId: string, feedback: string) {
    this.logger.log(`----- SUBMIT MATCH FEEDBACK -----`);
    this.logger.log({ user_id: userId });
    // Use a short transaction for atomic read+update
    return this.sequelize.transaction(async (tx: Transaction) => {
      // 1) Find the match (only the columns we need)
      const match = await this.matchModel.findOne({
        where: { id: matchId },
        attributes: ['id', 'user_a_id', 'user_b_id', 'user_a_feedback', 'user_b_feedback'],
        transaction: tx,
        rejectOnEmpty: false,
      });

      if (!match) {
        throw new NotFoundException('Match not found');
      }

      // 2) Decide which column to update
      const isUserA = match.user_a_id === userId;
      const isUserB = match.user_b_id === userId;

      if (!isUserA && !isUserB) {
        // user does not belong to this match
        throw new ForbiddenException('You are not part of this match');
      }

      // 3) Prepare partial update
      const patch: Partial<Match> = isUserA
        ? { user_a_feedback: feedback.trim() }
        : { user_b_feedback: feedback.trim() };

      // 4) Update record
      await this.matchModel.update(patch, { where: { id: matchId }, transaction: tx });

      // 5) Send feedback to AI service for learning
      // This happens outside the transaction to avoid blocking DB commit
      // Fire-and-forget approach (don't wait for AI response)
      this.sendFeedbackToAI(userId, matchId, feedback).catch(error => {
        // Log error but don't fail the entire operation
        this.logger.error('Failed to send feedback to AI service:', error.message);
      });

      // 6) Return a fresh copy (plain)
      const updated = await this.matchModel.findOne({
        where: { id: matchId },
        attributes: ['id', 'user_a_id', 'user_b_id', 'user_a_feedback', 'user_b_feedback'],
        transaction: tx,
        rejectOnEmpty: false,
      });

      // `updated` is guaranteed to exist since we just updated by id
      return updated.get({ plain: true });
    });
  }

  /**
   * Send feedback to AI service
   * ---------------------------
   * Private helper method that sends match feedback to AI service
   * for persona refinement and learning
   *
   * @param userId User ID
   * @param matchId Match ID
   * @param feedback Feedback text
   */
  private async sendFeedbackToAI(userId: string, matchId: string, feedback: string) {
    try {
      const request: UserFeedbackRequest = {
        user_id: userId,
        type: 'match',
        id: matchId,
        feedback: feedback.trim(),
      };

      await this.aiService.submitFeedback(request);
    } catch (error) {
      // Re-throw to be caught by caller
      throw error;
    }
  }

  /**
   * recentAgentActivity
   * -------------------
   * Returns last 7 days of dashboard-relevant activity for a user, paginated.
   * - Window: [now - 7 days, now]
   * - Events: AI_SUMMARY_APPROVED, NEW_MATCH_FOUND, AI_TO_AI_CONVERSATION_INITIATED
   * - Order: newest first
   */
  async recentAgentActivity(
    user_id: string,
    page: number,
    limit: number,
  ): Promise<RecentActivityResult> {
    this.logger.log(`----- RECENT AGENT ACTIVITY -----`);
    this.logger.log({ user_id });
    // 0) Pagination guards
    const currentPage = Math.max(1, Number.isFinite(page as any) ? Number(page) : 1);
    const pageSize = Math.max(1, Math.min(100, Number.isFinite(limit as any) ? Number(limit) : 10));
    const offset = (currentPage - 1) * pageSize;

    // 1) Rolling 7-day window (fixed from 7 days)
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 2) Filter by user, allowed events, and time window
    const { rows, count } = await this.userActivityLogModel.findAndCountAll({
      where: {
        user_id,
        event_type: { [Op.in]: DASHBOARD_ACTIVITY_EVENTS as unknown as string[] },
        event_time: { [Op.between]: [start, end] },
      },
      attributes: ['id', 'event_type', 'event_time', 'metadata', 'created_at'],
      order: [['event_time', 'DESC']],
      limit: pageSize,
      offset,
      raw: true,
      nest: true,
    });

    // 3) Shape + pagination meta
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    return {
      items: rows as RecentActivityItem[],
      page: currentPage,
      limit: pageSize,
      total: count,
      totalPages,
      range: { from: start.toISOString(), to: end.toISOString() },
    };
  }

  /**
   * listMatches
   * -----------
   * Paginated matches for a user with (status, sub_status) filters.
   * - status: pending | approved | declined
   * - sub_status:
   *   - approved: all | awaiting_other | approved
   *   - declined: all | passed | passed_by_me | passed_by_other
   * - Date filter: created_at ∈ [start_date, end_date] (inclusive)
   * Returns other_user* fields via user joins.
   */
  async listMatches(userId: string, dto: ListMatchesDto) {
    // status_label:
    // - pending: 'Pending' or 'awaiting_other' (if I approved)
    // - approved: 'Approved'
    // - declined: 'Passed' (both declined) | 'passed_by_me' | 'passed_by_other'
    //
    // feedback message:
    // - 'The match has been Passed by both parties' if both declined
    // - 'Feedback has been collected' if any feedback exists
    // - else 'No Feedback was given'
    // 1) Safety + pagination
    // validate status and sub_status
    this.logger.log(`----- LIST MATCHES -----`);
    this.logger.log({ user_id: userId });
    this.logger.log({ dto });
    await this.assertStatusSubStatusRules(dto);

    const page = Math.max(1, Number(dto.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(dto.limit ?? 20)));
    const offset = (page - 1) * limit;

    // 2) Precompute common bits
    const uid = this.sequelize.escape(userId); // safe for CASE literals

    // 3) Date window (inclusive)
    const dateWhere: WhereOptions = {};
    if (dto.start_date || dto.end_date) {
      dateWhere['created_at'] = {
        ...(dto.start_date ? { [Op.gte]: dto.start_date } : {}),
        ...(dto.end_date ? { [Op.lte]: dto.end_date } : {}),
      };
    }

    /**
     * 4) Status/Sub-Status Matrix (A-side and B-side branches)
     *
     * PENDING (ignore sub_status):
     *   A-branch: user_a_id=userId AND user_a_decision IN (pending,NULL) AND user_b_decision IN (pending,approved,NULL)
     *   B-branch: user_b_id=userId AND user_b_decision IN (pending,NULL) AND user_a_decision IN (pending,approved,NULL)
     *
     * APPROVED:
     *   sub_status=approved:
     *     BOTH approved & status=approved
     *   sub_status=awaiting_other:
     *     A approved / B pending | A pending / B approved, but overall status still pending
     *   sub_status=all:
     *     UNION of above two
     *
     * DECLINED:
     *   sub_status=passed_by_me:
     *     logged user's decision = declined (status overall declined)
     *   sub_status=passed_by_other:
     *     other user's decision = declined (status overall declined)
     *   sub_status=passed (both declined):
     *     both decisions declined (status overall declined)
     *   sub_status=all:
     *     UNION of the three above
     */

    // helpers for NULL-safe "pending"
    const isPendingOrNull = { [Op.or]: [{ [Op.eq]: MatchStatusEnum.PENDING }, { [Op.is]: null }] };
    const isPendingApprovedOrNull = {
      [Op.or]: [
        { [Op.in]: [MatchStatusEnum.PENDING, MatchStatusEnum.APPROVED] },
        { [Op.is]: null },
      ],
    };

    // Build OR branches for "user is A" and "user is B"
    const branches: WhereOptions[] = [];

    // --- PENDING ---
    if (dto.status === MatchStatusEnum.PENDING) {
      branches.push(
        {
          [Op.and]: [
            { status: MatchStatusEnum.PENDING },
            dateWhere,
            { user_a_id: userId },
            { user_a_decision: isPendingOrNull },
            { user_b_decision: isPendingApprovedOrNull },
          ],
        },
        {
          [Op.and]: [
            { status: MatchStatusEnum.PENDING },
            dateWhere,
            { user_b_id: userId },
            { user_b_decision: isPendingOrNull },
            { user_a_decision: isPendingApprovedOrNull },
          ],
        },
      );
    }

    // --- APPROVED ---
    if (dto.status === MatchStatusEnum.APPROVED) {
      const sub = dto.sub_status ?? SubStatusEnum.ALL;

      // Case 1: both approved & status=approved
      const bothApprovedA: WhereOptions = {
        [Op.and]: [
          { status: MatchStatusEnum.APPROVED },
          dateWhere,
          { user_a_id: userId },
          { user_a_decision: MatchStatusEnum.APPROVED },
          { user_b_decision: MatchStatusEnum.APPROVED },
        ],
      };
      const bothApprovedB: WhereOptions = {
        [Op.and]: [
          { status: MatchStatusEnum.APPROVED },
          dateWhere,
          { user_b_id: userId },
          { user_a_decision: MatchStatusEnum.APPROVED },
          { user_b_decision: MatchStatusEnum.APPROVED },
        ],
      };

      // Case 2: I approved, other pending (awaiting_other). Overall status still pending.
      const awaitingOtherA: WhereOptions = {
        [Op.and]: [
          { status: MatchStatusEnum.PENDING },
          dateWhere,
          { user_a_id: userId },
          { user_a_decision: MatchStatusEnum.APPROVED },
          { user_b_decision: { [Op.or]: [MatchStatusEnum.PENDING, { [Op.is]: null }] } },
        ],
      };
      const awaitingOtherB: WhereOptions = {
        [Op.and]: [
          { status: MatchStatusEnum.PENDING },
          dateWhere,
          { user_b_id: userId },
          { user_b_decision: MatchStatusEnum.APPROVED },
          { user_a_decision: { [Op.or]: [MatchStatusEnum.PENDING, { [Op.is]: null }] } },
        ],
      };

      if (sub === SubStatusEnum.APPROVED) {
        branches.push(bothApprovedA, bothApprovedB);
      } else if (sub === SubStatusEnum.AWAITING_OTHER) {
        branches.push(awaitingOtherA, awaitingOtherB);
      } else {
        // ALL = union of bothApproved and awaitingOther
        branches.push(bothApprovedA, bothApprovedB, awaitingOtherA, awaitingOtherB);
      }
    }

    // --- DECLINED ---
    if (dto.status === MatchStatusEnum.DECLINED) {
      const sub = dto.sub_status ?? SubStatusEnum.ALL;

      // passed_by_me: my decision declined (overall status declined)
      const passedByMeA: WhereOptions = {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_a_id: userId },
          { user_a_decision: MatchStatusEnum.DECLINED },
        ],
      };
      const passedByMeB: WhereOptions = {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_b_id: userId },
          { user_b_decision: MatchStatusEnum.DECLINED },
        ],
      };

      // passed_by_other: the other person declined
      const passedByOtherA: WhereOptions = {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_a_id: userId },
          { user_b_decision: MatchStatusEnum.DECLINED },
        ],
      };
      const passedByOtherB: WhereOptions = {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_b_id: userId },
          { user_a_decision: MatchStatusEnum.DECLINED },
        ],
      };

      // passed: both declined
      const bothDeclinedA: WhereOptions = {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_a_id: userId },
          { user_a_decision: MatchStatusEnum.DECLINED },
          { user_b_decision: MatchStatusEnum.DECLINED },
        ],
      };
      const bothDeclinedB: WhereOptions = {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_b_id: userId },
          { user_a_decision: MatchStatusEnum.DECLINED },
          { user_b_decision: MatchStatusEnum.DECLINED },
        ],
      };

      if (sub === SubStatusEnum.PASSED_BY_ME) {
        branches.push(passedByMeA, passedByMeB);
      } else if (sub === SubStatusEnum.PASSED_BY_OTHER) {
        branches.push(passedByOtherA, passedByOtherB);
      } else if (sub === SubStatusEnum.PASSED) {
        branches.push(bothDeclinedA, bothDeclinedB);
      } else {
        // ALL = union of the three groups
        branches.push(
          passedByMeA,
          passedByMeB,
          passedByOtherA,
          passedByOtherB,
          bothDeclinedA,
          bothDeclinedB,
        );
      }
    }

    // Fallback: if no branches (shouldn't happen), return empty
    if (branches.length === 0) {
      return {
        meta: { page, limit, total: 0, pages: 0 },
        items: [],
      };
    }

    // 5) Query using a single OR across A/B branches
    const { rows, count } = await this.matchModel.findAndCountAll({
      where: { [Op.or]: branches },
      include: [
        // Keep minimal joins to extract names/objectives for "other_user"
        { model: this.userModel, as: 'userA', attributes: [] },
        { model: this.userModel, as: 'userB', attributes: [] },
      ],
      attributes: [
        'id',
        ['created_at', 'match_date'],
        'status',
        'user_a_id',
        'user_b_id',
        'user_a_decision',
        'user_b_decision',
        'user_a_feedback',
        'user_b_feedback',
        'ai_to_ai_conversation',

        // other_user_id
        [
          this.sequelize.literal(
            `CASE WHEN "Match"."user_a_id" = ${uid} THEN "userB"."id" ELSE "userA"."id" END`,
          ),
          'other_user_id',
        ],
        // other_user_name
        [
          this.sequelize.literal(
            `CASE WHEN "Match"."user_a_id" = ${uid}
           THEN COALESCE("userB"."first_name",'') || ' ' || COALESCE("userB"."last_name",'')
           ELSE COALESCE("userA"."first_name",'') || ' ' || COALESCE("userA"."last_name",'') END`,
          ),
          'other_user_name',
        ],
        // other_user_designation (already stored on match)
        [
          this.sequelize.literal(
            `CASE WHEN "Match"."user_a_id" = ${uid}
           THEN "Match"."user_b_designation"
           ELSE "Match"."user_a_designation" END`,
          ),
          'other_user_designation',
        ],
        // other_user_objective (from users)
        [
          this.sequelize.literal(
            `CASE WHEN "Match"."user_a_id" = ${uid}
           THEN "userB"."objective" ELSE "userA"."objective" END`,
          ),
          'other_user_objective',
        ],
      ],
      subQuery: false,
      order: [['created_at', 'DESC']],
      offset,
      limit,
      raw: true,
      nest: false,
    });

    // With no GROUP BY, Sequelize returns a plain numeric count reliably
    const total = Number(count as any);

    // Map rows
    const items = rows.map((r: any) => {
      const isUserA = r.user_a_id === userId;
      const myDecision = isUserA ? r.user_a_decision : r.user_b_decision;
      const otherDecision = isUserA ? r.user_b_decision : r.user_a_decision;

      // status label
      let statusLabel = '';
      if (r.status === MatchStatusEnum.PENDING) {
        if (myDecision === MatchStatusEnum.APPROVED) statusLabel = 'awaiting_other';
        else if (myDecision === MatchStatusEnum.PENDING || myDecision === null)
          statusLabel = 'Pending';
      } else if (r.status === MatchStatusEnum.APPROVED) {
        statusLabel = 'Approved';
      } else if (r.status === MatchStatusEnum.DECLINED) {
        if (myDecision === MatchStatusEnum.DECLINED && otherDecision === MatchStatusEnum.DECLINED)
          statusLabel = 'Passed';
        else if (myDecision === MatchStatusEnum.DECLINED) statusLabel = 'passed_by_me';
        else if (otherDecision === MatchStatusEnum.DECLINED) statusLabel = 'passed_by_other';
      }

      // feedback message
      const userAFeedback = r.user_a_feedback;
      const userBFeedback = r.user_b_feedback;
      const hasFeedback =
        (userAFeedback && userAFeedback.trim()) || (userBFeedback && userBFeedback.trim());
      const feedbackMessage =
        statusLabel === 'Passed'
          ? 'The match has been Passed by both parties'
          : hasFeedback
          ? 'Feedback has been collected'
          : 'No Feedback was given';

      return {
        id: r.id,
        match_date: r.match_date,
        status: r.status,
        status_label: statusLabel,
        feedback: feedbackMessage,

        // ✅ now reads from boolean column
        is_ai_chat_initiated: Boolean(r.ai_to_ai_conversation),

        other_user: {
          id: r.other_user_id,
          name: String(r.other_user_name || '').trim(),
          designation: r.other_user_designation || 'Member',
          objective: r.other_user_objective || null,
        },
      };
    });

    return {
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      items,
    };
  }

  /**
   * listAgentReviewMatches
   * ----------------------
   * Paginated matches for agent review:
   * - ai_to_ai_conversation = TRUE
   * - ai_remarks_after_chat = dto.status  (APPROVED | DECLINED)  // controller should ensure valid enum
   * - user participates as user_a or user_b
   * - Optional date range on created_at (inclusive)
   * Emits other_user fields and AI decision label for UI.
   */
  async listAgentReviewMatches(userId: string, dto: ListAgentReviewMatchesDto) {
    this.logger.log(`----- LIST AGENT REVIEW MATCHES -----`);
    this.logger.log({ user_id: userId });
    this.logger.log({ dto });
    // status_label is static 'Approved' here because UI represents "AI-reviewed bucket"
    // ai_decision is taken from ai_remarks_after_chat if ai_to_ai_conversation is TRUE; else 'pending'
    // 1) Safety + pagination
    const page = Math.max(1, Number(dto.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(dto.limit ?? 20)));
    const offset = (page - 1) * limit;

    // 2) Precompute common bits
    const uid = this.sequelize.escape(userId); // safe for CASE literals

    // 3) Date window (inclusive)
    const dateWhere: WhereOptions = {};
    if (dto.start_date || dto.end_date) {
      dateWhere['created_at'] = {
        ...(dto.start_date ? { [Op.gte]: dto.start_date } : {}),
        ...(dto.end_date ? { [Op.lte]: dto.end_date } : {}),
      };
    }
    // 5) Query using a single OR across A/B branches
    const { rows, count } = await this.matchModel.findAndCountAll({
      where: {
        [Op.and]: [
          dateWhere,
          { ai_remarks_after_chat: dto.status, ai_to_ai_conversation: true },
          {
            [Op.or]: [
              // user is A
              { user_a_id: userId },
              // user is B
              { user_b_id: userId },
            ],
          },
        ],
      },
      include: [
        // Keep minimal joins to extract names/objectives for "other_user"
        { model: this.userModel, as: 'userA', attributes: [] },
        { model: this.userModel, as: 'userB', attributes: [] },
      ],
      attributes: [
        'id',
        ['created_at', 'match_date'],
        'status',
        'user_a_id',
        'user_b_id',
        'user_a_decision',
        'user_b_decision',
        'user_a_feedback',
        'user_b_feedback',
        'ai_remarks_after_chat',
        'ai_to_ai_conversation',

        // other_user_id
        [
          this.sequelize.literal(
            `CASE WHEN "Match"."user_a_id" = ${uid} THEN "userB"."id" ELSE "userA"."id" END`,
          ),
          'other_user_id',
        ],
        // other_user_name
        [
          this.sequelize.literal(
            `CASE WHEN "Match"."user_a_id" = ${uid}
           THEN COALESCE("userB"."first_name",'') || ' ' || COALESCE("userB"."last_name",'')
           ELSE COALESCE("userA"."first_name",'') || ' ' || COALESCE("userA"."last_name",'') END`,
          ),
          'other_user_name',
        ],
        // other_user_designation (already stored on match)
        [
          this.sequelize.literal(
            `CASE WHEN "Match"."user_a_id" = ${uid}
           THEN "Match"."user_b_designation"
           ELSE "Match"."user_a_designation" END`,
          ),
          'other_user_designation',
        ],
        // other_user_objective (from users)
        [
          this.sequelize.literal(
            `CASE WHEN "Match"."user_a_id" = ${uid}
           THEN "userB"."objective" ELSE "userA"."objective" END`,
          ),
          'other_user_objective',
        ],
      ],
      subQuery: false,
      order: [['created_at', 'DESC']],
      offset,
      limit,
      raw: true,
      nest: false,
    });

    // With no GROUP BY, Sequelize returns a plain numeric count reliably
    const total = Number(count as any);

    // Map rows
    const items = rows.map((r: any) => {
      // feedback message
      const userAFeedback = r.user_a_feedback;
      const userBFeedback = r.user_b_feedback;
      const hasFeedback =
        (userAFeedback && userAFeedback.trim()) || (userBFeedback && userBFeedback.trim());
      const feedbackMessage = hasFeedback ? 'Feedback has been collected' : 'No Feedback was given';

      return {
        id: r.id,
        match_date: r.match_date,
        status: r.status,
        status_label:
          r.ai_remarks_after_chat === MatchStatusEnum.APPROVED ? 'pursued' : 'not_pursued',
        ai_decision: r.ai_remarks_after_chat,
        feedback: feedbackMessage,

        // ✅ now reads from boolean column
        is_ai_chat_initiated: Boolean(r.ai_to_ai_conversation),

        other_user: {
          id: r.other_user_id,
          name: String(r.other_user_name || '').trim(),
          designation: r.other_user_designation || 'Member',
          objective: r.other_user_objective || null,
        },
      };
    });

    return {
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      items,
    };
  }

  /**
   * assertStatusSubStatusRules
   * --------------------------
   * Validates (status, sub_status):
   * - pending: sub_status must be omitted
   * - approved: sub_status ∈ {all, awaiting_other, approved} if provided
   * - declined: sub_status ∈ {all, passed, passed_by_me, passed_by_other} if provided
   */
  async assertStatusSubStatusRules(dto: ListMatchesDto) {
    const status = dto.status ?? MatchStatusEnum.PENDING; // your DTO default
    const sub: any = dto.sub_status;

    // 1) pending: sub_status must NOT be present
    if (status === MatchStatusEnum.PENDING) {
      if (typeof sub !== 'undefined' && sub !== null) {
        throw new BadRequestException('sub_status must not be provided when status=pending');
      }
      return; // valid
    }

    // 2) approved: sub_status optional, but if present must be in allowed set
    if (status === MatchStatusEnum.APPROVED) {
      const allowed = new Set<SubStatusEnum>([
        SubStatusEnum.ALL,
        SubStatusEnum.AWAITING_OTHER,
        SubStatusEnum.APPROVED,
      ]);
      if (typeof sub !== 'undefined' && sub !== null && !allowed.has(sub)) {
        throw new BadRequestException(
          `Invalid sub_status for status=approved. Allowed: ${Array.from(allowed).join(', ')}`,
        );
      }
      return; // valid
    }

    // 3) declined: sub_status optional, but if present must be in allowed set
    if (status === MatchStatusEnum.DECLINED) {
      const allowed = new Set<SubStatusEnum>([
        SubStatusEnum.ALL,
        SubStatusEnum.PASSED,
        SubStatusEnum.PASSED_BY_ME,
        SubStatusEnum.PASSED_BY_OTHER,
      ]);
      if (typeof sub !== 'undefined' && sub !== null && !allowed.has(sub)) {
        throw new BadRequestException(
          `Invalid sub_status for status=declined. Allowed: ${Array.from(allowed).join(', ')}`,
        );
      }
      return; // valid
    }

    // 4) unknown status
    throw new BadRequestException('Invalid status value.');
  }

  /**
   * Build a date window where-clause identical to listMatches.
   */
  private buildDateWhere(dto: CountMatchesDto): WhereOptions {
    const dateWhere: WhereOptions = {};
    if (dto.start_date || dto.end_date) {
      dateWhere['created_at'] = {
        ...(dto.start_date ? { [Op.gte]: dto.start_date } : {}),
        ...(dto.end_date ? { [Op.lte]: dto.end_date } : {}),
      };
    }
    return dateWhere;
  }

  /**
   * Helpers reused from listMatches semantics.
   * We build "branches" and then do count({ where: { [Op.or]: branches } })
   */
  private pendingBranches(userId: string, dateWhere: WhereOptions): WhereOptions[] {
    const isPendingOrNull = { [Op.or]: [{ [Op.eq]: MatchStatusEnum.PENDING }, { [Op.is]: null }] };
    const isPendingApprovedOrNull = {
      [Op.or]: [
        { [Op.in]: [MatchStatusEnum.PENDING, MatchStatusEnum.APPROVED] },
        { [Op.is]: null },
      ],
    };

    return [
      {
        [Op.and]: [
          { status: MatchStatusEnum.PENDING },
          dateWhere,
          { user_a_id: userId },
          { user_a_decision: isPendingOrNull },
          { user_b_decision: isPendingApprovedOrNull },
        ],
      },
      {
        [Op.and]: [
          { status: MatchStatusEnum.PENDING },
          dateWhere,
          { user_b_id: userId },
          { user_b_decision: isPendingOrNull },
          { user_a_decision: isPendingApprovedOrNull },
        ],
      },
    ];
  }

  private approvedBothBranches(userId: string, dateWhere: WhereOptions): WhereOptions[] {
    return [
      {
        [Op.and]: [
          { status: MatchStatusEnum.APPROVED },
          dateWhere,
          { user_a_id: userId },
          { user_a_decision: MatchStatusEnum.APPROVED },
          { user_b_decision: MatchStatusEnum.APPROVED },
        ],
      },
      {
        [Op.and]: [
          { status: MatchStatusEnum.APPROVED },
          dateWhere,
          { user_b_id: userId },
          { user_a_decision: MatchStatusEnum.APPROVED },
          { user_b_decision: MatchStatusEnum.APPROVED },
        ],
      },
    ];
  }

  private approvedAwaitingOtherBranches(userId: string, dateWhere: WhereOptions): WhereOptions[] {
    return [
      {
        [Op.and]: [
          { status: MatchStatusEnum.PENDING }, // overall still pending
          dateWhere,
          { user_a_id: userId },
          { user_a_decision: MatchStatusEnum.APPROVED },
          { user_b_decision: { [Op.or]: [MatchStatusEnum.PENDING, { [Op.is]: null }] } },
        ],
      },
      {
        [Op.and]: [
          { status: MatchStatusEnum.PENDING },
          dateWhere,
          { user_b_id: userId },
          { user_b_decision: MatchStatusEnum.APPROVED },
          { user_a_decision: { [Op.or]: [MatchStatusEnum.PENDING, { [Op.is]: null }] } },
        ],
      },
    ];
  }

  private declinedPassedByMeBranches(userId: string, dateWhere: WhereOptions): WhereOptions[] {
    return [
      {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_a_id: userId },
          { user_a_decision: MatchStatusEnum.DECLINED },
        ],
      },
      {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_b_id: userId },
          { user_b_decision: MatchStatusEnum.DECLINED },
        ],
      },
    ];
  }

  private declinedPassedByOtherBranches(userId: string, dateWhere: WhereOptions): WhereOptions[] {
    return [
      {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_a_id: userId },
          { user_b_decision: MatchStatusEnum.DECLINED },
        ],
      },
      {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_b_id: userId },
          { user_a_decision: MatchStatusEnum.DECLINED },
        ],
      },
    ];
  }

  private declinedBothBranches(userId: string, dateWhere: WhereOptions): WhereOptions[] {
    return [
      {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_a_id: userId },
          { user_a_decision: MatchStatusEnum.DECLINED },
          { user_b_decision: MatchStatusEnum.DECLINED },
        ],
      },
      {
        [Op.and]: [
          { status: MatchStatusEnum.DECLINED },
          dateWhere,
          { user_b_id: userId },
          { user_a_decision: MatchStatusEnum.DECLINED },
          { user_b_decision: MatchStatusEnum.DECLINED },
        ],
      },
    ];
  }

  /**
   * countMatchesByStatus
   * --------------------
   * Returns union-safe counts aligned with listMatches semantics.
   * Filters: date only (no status/sub_status in input).
   */
  async countMatchesByStatus(userId: string, dto: CountMatchesDto | CountAgentReviewMatchesDto) {
    this.logger.log(`----- COUNT MATCHES BY STATUS -----`);
    this.logger.log({ user_id: userId });
    const dateWhere = this.buildDateWhere(dto);
    const countByBranches = async (branches: WhereOptions[]): Promise<number> =>
      branches.length ? this.matchModel.count({ where: { [Op.or]: branches } }) : 0;

    // Pending
    const pending = await countByBranches(this.pendingBranches(userId, dateWhere));

    // Approved buckets
    const approvedBothBranches = this.approvedBothBranches(userId, dateWhere);
    const approvedAwaitingOtherBranches = this.approvedAwaitingOtherBranches(userId, dateWhere);

    const approvedApproved = await countByBranches(approvedBothBranches);
    const approvedAwaitingOther = await countByBranches(approvedAwaitingOtherBranches);

    // **Union** (no double-count) by OR-ing both approved branch sets
    const approvedTotal = await countByBranches([
      ...approvedBothBranches,
      ...approvedAwaitingOtherBranches,
    ]);

    // Passed buckets
    const passedByMeBranches = this.declinedPassedByMeBranches(userId, dateWhere);
    const passedByOtherBranches = this.declinedPassedByOtherBranches(userId, dateWhere);
    const bothPassedBranches = this.declinedBothBranches(userId, dateWhere);

    const passedByMe = await countByBranches(passedByMeBranches);
    const passedByOther = await countByBranches(passedByOtherBranches);
    const bothPassed = await countByBranches(bothPassedBranches);

    // **Union** (no double-count) across all three passed conditions
    const passedTotal = await countByBranches([
      ...passedByMeBranches,
      ...passedByOtherBranches,
      ...bothPassedBranches,
    ]);

    // **Union** (no double-count) across all three passed conditions
    return {
      pending,
      approved: {
        approved: approvedApproved,
        awaiting_other: approvedAwaitingOther,
        total: approvedTotal, // union of approved buckets
      },
      passed: {
        passed_by_me: passedByMe,
        passed_by_other: passedByOther,
        passed: bothPassed,
        total: passedTotal, // union of passed buckets (no double count)
      },
    };
  }

  /**
   * countAgentReviewMatchesByStatus
   * -------------------------------
   * Counts agent-review buckets for a user within an optional date window:
   * - approved: ai_to_ai_conversation = TRUE AND ai_remarks_after_chat = APPROVED
   * - declined: ai_to_ai_conversation = TRUE AND ai_remarks_after_chat = DECLINED
   * (User must be in user_a_id OR user_b_id.)
   */
  async countAgentReviewMatchesByStatus(userId: string, dto: CountAgentReviewMatchesDto) {
    this.logger.log(`----- COUNT AGENT REVIEW MATCHES BY STATUS -----`);
    this.logger.log({ user_id: userId });
    // 1) Date window (inclusive)
    const dateWhere: WhereOptions = {};
    if (dto.start_date || dto.end_date) {
      dateWhere['created_at'] = {
        ...(dto.start_date ? { [Op.gte]: dto.start_date } : {}),
        ...(dto.end_date ? { [Op.lte]: dto.end_date } : {}),
      };
    }

    // 2) Common base where (user in A/B + date + ai_to_ai_conversation = true)
    const baseWhere: WhereOptions = {
      [Op.and]: [
        dateWhere,
        { ai_to_ai_conversation: true },
        { [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }] },
      ],
    };

    // 4) Count subsets by ai_remarks_after_chat
    const approved = await this.matchModel.count({
      where: { ...baseWhere, ai_remarks_after_chat: MatchStatusEnum.APPROVED },
    });

    const declined = await this.matchModel.count({
      where: { ...baseWhere, ai_remarks_after_chat: MatchStatusEnum.DECLINED },
    });

    // 5) Return simple shape (also include union total of status buckets)
    return {
      approved,
      passed: declined,
    };
  }

  /**
   * getMatchExplanation
   * -------------------
   * Phase 1.1: Match Explanation UI
   * Returns AI-generated explanation for why two users matched.
   * Fetches from cache (stored on match) or generates fresh via AI service.
   *
   * @param matchId - UUID of the match
   * @param userId - UUID of requesting user (for authorization)
   * @param forceRefresh - Force new generation even if cached
   * @returns Match explanation with synergy areas, friction points, and talking points
   */
  async getMatchExplanation(matchId: string, userId: string, forceRefresh = false) {
    this.logger.log(`----- GET MATCH EXPLANATION -----`);
    this.logger.log({ match_id: matchId, user_id: userId, force_refresh: forceRefresh });

    // 1) Find the match and verify user is a participant
    const match = await this.matchModel.findOne({
      where: {
        id: matchId,
        [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }],
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found or you are not a participant');
    }

    // 2) Check if we have cached explanation and it's not a force refresh
    if (match.explanation && !forceRefresh) {
      this.logger.log(`Returning cached explanation for match: ${matchId}`);
      const compatibilityScore = match.user_a_persona_compatibility_score
        ? match.user_a_persona_compatibility_score
        : 50;
      return {
        match_id: matchId,
        explanation: match.explanation.summary,
        compatibility_score: compatibilityScore,
        synergy_areas: match.synergy_areas || [],
        friction_points: match.friction_points || [],
        talking_points: match.talking_points || [],
        score_breakdown: match.score_breakdown || null,
        match_tier: match.match_tier || 'worth_exploring',
        generated_at: match.explanation.generated_at || new Date().toISOString(),
        cached: true,
      };
    }

    // 3) Generate new explanation via AI service
    const aiResponse = await this.aiService.getMatchExplanation({
      match_id: matchId,
      user_a_id: match.user_a_id,
      user_b_id: match.user_b_id,
      force_refresh: forceRefresh,
    });

    // BUG FIX #5: Use stored DB score for consistency, NOT the AI-generated score
    // This prevents compatibility % from fluctuating on reload
    const storedScore = match.user_a_persona_compatibility_score
      ? match.user_a_persona_compatibility_score
      : 50;

    // 4) Update match with new explanation (cache it)
    await this.matchModel.update(
      {
        explanation: {
          summary: aiResponse.summary,
          generated_at: new Date().toISOString(),
        },
        synergy_areas: aiResponse.synergy_areas,
        friction_points: aiResponse.friction_points,
        talking_points: aiResponse.talking_points,
        score_breakdown: aiResponse.score_breakdown || null,
        match_tier: aiResponse.match_tier,
      },
      { where: { id: matchId } },
    );

    const generatedAt = new Date().toISOString();
    return {
      match_id: matchId,
      explanation: aiResponse.summary,
      compatibility_score: storedScore, // Use stored score, not AI-generated
      synergy_areas: aiResponse.synergy_areas,
      friction_points: aiResponse.friction_points,
      talking_points: aiResponse.talking_points,
      score_breakdown: aiResponse.score_breakdown || null,
      match_tier: aiResponse.match_tier,
      generated_at: generatedAt,
      cached: false,
    };
  }

  /**
   * computeMatchTier
   * ----------------
   * Phase 2.3: Tiered Match Badges
   * Helper method to compute match tier from compatibility score.
   *
   * @param score - Compatibility score (0-100)
   * @returns Match tier string
   */
  private computeMatchTier(score: number): 'perfect' | 'strong' | 'worth_exploring' | 'low' {
    if (score >= 85) return 'perfect';
    if (score >= 70) return 'strong';
    if (score >= 55) return 'worth_exploring';
    return 'low';
  }

  /**
   * getIceBreakers
   * --------------
   * Phase 1.2: Guided First Message
   * Returns AI-generated conversation starters for a match.
   * Fetches from cache or generates fresh via AI service.
   *
   * @param matchId - UUID of the match
   * @param userId - UUID of requesting user
   * @returns Ice breaker suggestions
   */
  async getIceBreakers(matchId: string, userId: string) {
    this.logger.log(`----- GET ICE BREAKERS -----`);
    this.logger.log({ match_id: matchId, user_id: userId });

    // 1) Find the match and verify user is a participant
    const match = await this.matchModel.findOne({
      where: {
        id: matchId,
        [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }],
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found or you are not a participant');
    }

    // 2) Determine other user ID
    const otherUserId = match.user_a_id === userId ? match.user_b_id : match.user_a_id;

    // 3) Check if we have cached ice breakers
    const existingIceBreaker = await this.iceBreakerModel.findOne({
      where: { match_id: matchId, user_id: userId },
    });

    // Get other user details for the response
    const otherUser = await this.userModel.findByPk(otherUserId, {
      attributes: ['id', 'first_name', 'last_name', 'objective'],
    });
    const otherUserName = otherUser
      ? `${otherUser.first_name} ${otherUser.last_name}`
      : 'this person';

    if (existingIceBreaker) {
      this.logger.log(`Returning cached ice breakers for match: ${matchId}`);
      return {
        ice_breakers: {
          id: existingIceBreaker.id,
          match_id: matchId,
          user_id: userId,
          suggestions: existingIceBreaker.suggestions,
          selected_suggestion: existingIceBreaker.selected_suggestion,
          used_at: existingIceBreaker.used_at,
          created_at: existingIceBreaker.created_at,
        },
        match: {
          id: matchId,
          other_user_name: otherUserName,
          other_user_objective: otherUser?.objective || '',
        },
        cached: true,
      };
    }

    // 4) Generate new ice breakers via AI service
    const aiResponse = await this.aiService.getIceBreakers({
      match_id: matchId,
      user_id: userId,
      other_user_id: otherUserId,
      context: {
        synergy_areas: match.synergy_areas || [],
        talking_points: match.talking_points || [],
      },
    });

    // 5) Store ice breakers in database
    const newIceBreaker = await this.iceBreakerModel.create({
      match_id: matchId,
      user_id: userId,
      suggestions: aiResponse.suggestions,
    });

    return {
      ice_breakers: {
        id: newIceBreaker.id,
        match_id: matchId,
        user_id: userId,
        suggestions: aiResponse.suggestions,
        selected_suggestion: null,
        used_at: null,
        created_at: newIceBreaker.created_at,
      },
      match: {
        id: matchId,
        other_user_name: otherUserName,
        other_user_objective: otherUser?.objective || '',
      },
      cached: false,
    };
  }

  /**
   * trackIceBreakerUsage
   * --------------------
   * Phase 1.2: Guided First Message
   * Records when a user selects/uses an ice breaker.
   *
   * @param matchId - UUID of the match
   * @param userId - UUID of requesting user
   * @param selectedIndex - Index of selected suggestion
   * @returns Updated ice breaker record
   */
  async trackIceBreakerUsage(matchId: string, userId: string, selectedIndex: number) {
    this.logger.log(`----- TRACK ICE BREAKER USAGE -----`);
    this.logger.log({ match_id: matchId, user_id: userId, selected_index: selectedIndex });

    // Find the ice breaker record
    const iceBreaker = await this.iceBreakerModel.findOne({
      where: { match_id: matchId, user_id: userId },
    });

    if (!iceBreaker) {
      throw new NotFoundException('Ice breaker not found for this match');
    }

    // Validate selected index
    if (selectedIndex < 0 || selectedIndex >= iceBreaker.suggestions.length) {
      throw new BadRequestException('Invalid suggestion index');
    }

    // Update the record
    const usedAt = new Date();
    await this.iceBreakerModel.update(
      {
        selected_suggestion: selectedIndex,
        used_at: usedAt,
      },
      { where: { id: iceBreaker.id } },
    );

    return {
      success: true,
      ice_breaker_id: iceBreaker.id,
      selected_index: selectedIndex,
      used_at: usedAt.toISOString(),
    };
  }

  /**
   * submitMatchFeedbackWithReasons
   * ------------------------------
   * Phase 2.1: Feedback Learning Loop
   * Records structured feedback for a match decision with reason tags.
   *
   * @param userId - UUID of the user
   * @param matchId - UUID of the match
   * @param decision - 'approved' or 'declined'
   * @param reasonTags - Array of reason tag enums
   * @param reasonText - Free-text explanation
   * @param decisionTimeMs - Time taken to decide (for engagement analysis)
   * @returns Feedback record
   */
  async submitMatchFeedbackWithReasons(
    userId: string,
    matchId: string,
    decision: 'approved' | 'declined',
    reasonTags?: string[],
    reasonText?: string,
    decisionTimeMs?: number,
  ) {
    this.logger.log(`----- SUBMIT MATCH FEEDBACK WITH REASONS -----`);
    this.logger.log({ user_id: userId, match_id: matchId, decision, reason_tags: reasonTags });

    // 1) Find the match and verify user is a participant
    const match = await this.matchModel.findOne({
      where: {
        id: matchId,
        [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }],
      },
      include: [
        {
          model: this.userModel,
          as: 'userA',
          attributes: ['id', 'objective', 'onboarding_status'],
        },
        {
          model: this.userModel,
          as: 'userB',
          attributes: ['id', 'objective', 'onboarding_status'],
        },
      ],
    });

    if (!match) {
      throw new NotFoundException('Match not found or you are not a participant');
    }

    // 2) Get other user's attributes for learning snapshot
    const isUserA = match.user_a_id === userId;
    const otherUser = isUserA ? match.user_b : match.user_a;
    const otherUserAttributes = otherUser
      ? {
          id: otherUser.id,
          objective: otherUser.objective,
        }
      : null;

    // 3) Create feedback record
    const feedback = await this.matchFeedbackModel.create({
      match_id: matchId,
      user_id: userId,
      decision,
      reason_tags: reasonTags || [],
      reason_text: reasonText || null,
      decision_time_ms: decisionTimeMs || null,
      other_user_attributes: otherUserAttributes,
    });

    // 4) Send to AI service for learning (fire-and-forget)
    this.aiService
      .submitFeedbackWithReasons({
        user_id: userId,
        match_id: matchId,
        decision,
        reason_tags: reasonTags,
        reason_text: reasonText,
        decision_time_ms: decisionTimeMs,
        other_user_attributes: otherUserAttributes || undefined,
      })
      .catch(error => {
        this.logger.error('Failed to send feedback to AI service for learning:', error.message);
      });

    return {
      feedback_id: feedback.id,
      match_id: matchId,
      decision,
      reason_tags: reasonTags || [],
      recorded_at: feedback.created_at,
    };
  }

  // ==========================================
  // Admin Dashboard Diagnostics
  // System health, matching diagnostics
  // ==========================================

  /**
   * getSystemHealth
   * ---------------
   * Returns comprehensive health status of all AI components.
   *
   * @returns System health status with green/red indicators
   */
  async getSystemHealth() {
    this.logger.log(`----- GET SYSTEM HEALTH -----`);
    try {
      const response = await this.aiService.getSystemHealth();
      return {
        code: 200,
        message: 'System health retrieved',
        result: response,
      };
    } catch (error) {
      this.logger.error(`Failed to get system health: ${error.message}`);
      return {
        code: 500,
        message: error.message,
        result: {
          overall_status: 'error',
          error: error.message,
        },
      };
    }
  }

  /**
   * getMatchingDiagnostics
   * ----------------------
   * Returns all users with their matching parameters.
   *
   * @returns Matching diagnostics for all users
   */
  async getMatchingDiagnostics() {
    this.logger.log(`----- GET MATCHING DIAGNOSTICS -----`);
    try {
      const response = await this.aiService.getMatchingDiagnostics();
      return {
        code: 200,
        message: 'Matching diagnostics retrieved',
        result: response.result || response,
        summary: response.summary || null,
      };
    } catch (error) {
      this.logger.error(`Failed to get matching diagnostics: ${error.message}`);
      return {
        code: 500,
        message: error.message,
        result: [],
      };
    }
  }

  /**
   * getAdminUserList
   * ----------------
   * Returns list of all users with their status.
   *
   * @returns User list with status
   */
  async getAdminUserList() {
    this.logger.log(`----- GET ADMIN USER LIST -----`);
    try {
      const response = await this.aiService.getAdminUserList();
      return {
        code: 200,
        message: 'User list retrieved',
        result: response.result || response,
        summary: response.summary || null,
      };
    } catch (error) {
      this.logger.error(`Failed to get admin user list: ${error.message}`);
      return {
        code: 500,
        message: error.message,
        result: [],
      };
    }
  }

  /**
   * regenerateEmbeddings
   * --------------------
   * Triggers embedding regeneration for a user (admin operation).
   * Used to fix incomplete embeddings or regenerate after data updates.
   *
   * @param userId - User ID to regenerate embeddings for
   * @returns Response from AI service
   */
  async regenerateEmbeddings(userId: string) {
    this.logger.log(`----- REGENERATE EMBEDDINGS FOR USER: ${userId} -----`);
    try {
      const response = await this.aiService.regenerateEmbeddings(userId);
      return {
        code: 200,
        message: 'Embedding regeneration triggered successfully',
        result: response.result || response,
      };
    } catch (error) {
      this.logger.error(`Failed to regenerate embeddings for user ${userId}: ${error.message}`);
      return {
        code: 500,
        message: error.message,
        result: null,
      };
    }
  }
}
