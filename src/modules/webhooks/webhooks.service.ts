/**
 * WebhooksService
 * -------------------------------------------------------------
 * Purpose:
 * - Handle incoming webhook events from AI + Matching services.
 * - Persist AI summaries (versioned) and insert match rows.
 * - Notify users via FCM when summaries or matches are ready.
 *
 * Summary:
 * - All DB writes are wrapped in Sequelize transactions for atomicity.
 * - External I/O (FCM, HTTP) is performed after successful commits.
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { MatchBatch } from 'src/common/entities/match-batch.entity';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { Message } from 'src/common/entities/message.entity';
import { Match } from 'src/common/entities/match.entity';
import { User } from 'src/common/entities/user.entity';
import { NotificationService } from 'src/modules/notifications/notification.service';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';
import { OnBoardingService } from 'src/modules/onboarding/onboarding.service';
import {
  UserMatchesReadyWebhookDto,
  MatchesReadyWebhookDto,
  SummaryReadyDto,
  AiChatReadyDto,
} from 'src/modules/webhooks/dto/webhooks.dto';
import {
  MatchBatchStatusEnum,
  MatchStatusEnum,
  ConversationStatusEnum,
  UserActivityEventsEnum,
} from 'src/common/enums';
import { UserActivityLogsService } from 'src/modules/user-activity-logs/user-activity-logs.service';
import { RealtimeEventsService } from 'src/modules/realtime/realtime-events.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  constructor(
    private readonly sequelize: Sequelize,
    private readonly realtimeEvents: RealtimeEventsService,

    @InjectModel(Message)
    private messageModel: typeof Message,

    @InjectModel(UserSummaries)
    private userSummaryModel: typeof UserSummaries,

    @InjectModel(AiConversation)
    private aiConversationModel: typeof AiConversation,

    @InjectModel(MatchBatch)
    private matchBatchModel: typeof MatchBatch,

    @InjectModel(Match)
    private matchModel: typeof Match,

    @InjectModel(User)
    private userModel: typeof User,

    private readonly notificationService: NotificationService,
    private readonly dailyAnalyticsService: DailyAnalyticsService,
    private readonly userActivityLogsService: UserActivityLogsService,
    private readonly onboardingService: OnBoardingService,
  ) {}

  /**
   * summaryReadyWebhook
   * -----------------------------------------------------------
   * Summary:
   * - Notify user that AI summary is ready (real-time event only).
   *
   * May-04 fix: this webhook NO LONGER writes to user_summaries. The AI
   * service is the canonical writer for that table — it writes
   * status='approved' rows directly via persona_processing.py:212 with
   * the full persona content (## TL;DR section, persona archetype name
   * as title, all sections in lockstep with notification_service's
   * compose path).
   *
   * Previously this webhook created a SECOND row with status='draft' +
   * JSON.stringify(summary) artifacts, using a re-compose path that
   * differed from the AI service's direct write — different `name`
   * field used (user's actual name vs persona archetype name) and
   * MISSING the `tldr` field added on May-04 (commit ba007b1).
   *
   * Frontend's getSummary endpoint orders by created_at DESC, so the
   * later-written v2 row was overriding v1 from the user's POV. After
   * this fix only one row exists per user (the AI service's
   * status='approved' write), so the user sees the canonical persona.
   *
   * The Socket.IO emit retained — frontend's `useSocketEvent('summary.ready')`
   * handler ignores the payload and just calls refetch() to re-pull from
   * the API. We send a lighter payload now (no summary text, no version,
   * no summaryId — frontend doesn't need them).
   *
   * Flow:
   * webhook → validate → emit Socket.IO 'summary.ready' → return true
   */
  async summaryReadyWebhook(body: SummaryReadyDto) {
    this.logger.log('++++++ SUMMARY READY WEBHOOK ++++++++++');
    this.logger.log({ timestamp: new Date(Date.now()) });
    this.logger.log({ body });

    const { user_id, summary } = body || ({} as SummaryReadyDto);

    if (!user_id || !summary) {
      throw new BadRequestException('user_id and summary are required');
    }

    // May-04: notification-only — no DB write. AI service has already
    // written status='approved' to user_summaries with the canonical
    // persona content via persona_processing.py:212.
    this.realtimeEvents.emitToUser(String(user_id), 'summary.ready', {
      type: 'SUMMARY_READY',
      userId: String(user_id),
    });

    return { success: true };
  }

  /**
   * userMatchesReadyWebhook
   * -----------------------------------------------------------
   * Summary:
   * - Ensure batch exists and insert missing user match pairs.
   * - Sends FCM with list of just-created matches.
   *
   * Steps:
   * 1) Validate input (batch_id, user_id, matches[]).
   * 2) Build map of target_id → target_designation.
   * 3) TX:
   *    a) upsert batch if not exists.
   *    b) load existing pairs in either orientation (A|B or B|A).
   *    c) insert only missing pairs normalized as (user_a=user_id, user_b=target).
   * 4) After commit: send FCM with created items.
   *
   * Flow:
   * webhook → validate → map targets → TX(upsert batch + insert matches) → commit → FCM → return
   */
  async userMatchesReadyWebhook(body: UserMatchesReadyWebhookDto) {
    this.logger.log('+++++ USER MATCHES FOUND WEBHOOK ++++++');
    this.logger.log({ timestamp: new Date(Date.now()) });
    this.logger.log({ body });

    const { batch_id, user_id, matches } = body || ({} as UserMatchesReadyWebhookDto);
    if (!batch_id || !user_id || !Array.isArray(matches)) {
      throw new BadRequestException('batch_id, user_id and matches[] are required');
    }

    // 2) collect targets, designations, and scores
    const byId = new Map<string, string | null>();
    const scoreById = new Map<string, number>();
    if (matches.length > 0) {
      for (const m of matches) {
        if (m?.target_user_id) {
          byId.set(m.target_user_id, m.target_user_designation ?? null);
          // Store AI-calculated match score (0-100), default 50 if not provided
          scoreById.set(m.target_user_id, (m as any).match_score ?? 50);
        }
      }
      const targetIds = [...byId.keys()];
      if (targetIds.length > 0) {
        this.logger.log({ target_ids: targetIds.length });

        // helpers
        const todayUtcYYYYMMDD = new Date().toISOString().slice(0, 10);
        const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

        // 3) all writes are transactional
        const createdRows = await this.sequelize.transaction(async (tx: Transaction) => {
          const now = new Date();

          // 3a) ensure batch exists
          const found = await this.matchBatchModel.findByPk(batch_id, {
            transaction: tx,
            raw: true,
          });
          if (!found) {
            await this.matchBatchModel.create(
              {
                id: batch_id,
                status: MatchBatchStatusEnum.COMPLETED,
                match_date: todayUtcYYYYMMDD,
                data: {},
                created_at: now,
                updated_at: now,
              },
              { transaction: tx },
            );
          }

          // 3b) load existing pairs for this batch in either orientation
          const existingPairs = await this.matchModel.findAll({
            where: {
              //batch_id,
              [Op.or]: [
                { user_a_id: user_id, user_b_id: { [Op.in]: targetIds } },
                { user_b_id: user_id, user_a_id: { [Op.in]: targetIds } },
              ],
            },
            attributes: ['user_a_id', 'user_b_id'],
            raw: true,
            transaction: tx,
          });

          const existingSet = new Set<string>(
            existingPairs.map(e => pairKey(e.user_a_id, e.user_b_id)),
          );

          // 3c) prepare only missing rows; normalize as (A=user_id, B=target)
          const toInsertTargets = targetIds.filter(tid => !existingSet.has(pairKey(user_id, tid)));
          this.logger.log({ to_insert_targets: toInsertTargets.length });

          if (toInsertTargets.length === 0) {
            return [] as Match[];
          }

          const rows = toInsertTargets.map(tid => ({
            batch_id,
            user_a_id: user_id,
            user_b_id: tid,
            user_a_feedback: null,
            user_b_feedback: null,
            // Use AI-calculated score instead of null (which defaults to 50)
            user_a_persona_compatibility_score: scoreById.get(tid) ?? 50,
            user_b_persona_compatibility_score: scoreById.get(tid) ?? 50,
            user_a_decision: null,
            user_b_decision: null,
            user_a_designation: null,
            user_b_designation: byId.get(tid) ?? null,
            user_a_objective: null,
            user_b_objective: null,
            ai_remarks_after_chat: null,
            user_to_user_conversation: false,
            status: MatchStatusEnum.PENDING,
            perfect_match: false,
            created_at: now,
            updated_at: now,
          }));

          const created = await this.matchModel.bulkCreate(rows, {
            returning: true,
            transaction: tx,
            ignoreDuplicates: true, // Prevent race condition duplicates with unique constraint
          });

          // 3d.i) insert activity log (New match found)
          await this.userActivityLogsService.insertActivityLog(
            UserActivityEventsEnum.NEW_MATCH_FOUND,
            user_id,
            tx,
          );

          // 3d.ii) insert activity log (New match found)
          await Promise.allSettled(
            toInsertTargets.map(uid =>
              this.userActivityLogsService.insertActivityLog(
                UserActivityEventsEnum.NEW_MATCH_FOUND,
                uid,
                tx,
              ),
            ),
          );
          // daily analytics entry
          await this.dailyAnalyticsService.bumpToday('matches_total', {
            by: toInsertTargets.length,
            transaction: tx,
          });

          return created;
        });
      }
    }

    // // 4) notify after successful commit (data-only push)
    // const resp = await this.sendMatchesFcm(user_id, matches.length);
    // 4) notify after successful commit (Socket.IO)
    this.realtimeEvents.emitToUser(String(user_id), 'user.matches.ready', {
      type: 'USER_MATCHES_READY',
      userId: String(user_id),
      count: String(matches.length),
    });
    return true;
  }

  /**
   * sendMatchesFcm
   * -----------------------------------------------------------
   * Summary:
   * - Send a data-only FCM notification
   *
   * Steps:
   * 1) Build compact payload.
   * 2) Fetch user's FCM tokens.
   * 3) Send notification if tokens exist.
   *
   * Flow:
   * items[] → payload → tokens → sendToUser
   */
  private async sendMatchesFcm(
    userId: string,
    length: any, //, batchId: string, created: Match[]
  ) {
    const data: Record<string, string> = {
      type: 'USER_MATCHES_READY',
      userId: String(userId),
      count: String(length),
    };

    const resp = await this.notificationService.sendToUser(
      String(userId),
      'Your Matches are ready',
      'Tap to review.',
      data,
    );
    return resp;
  }

  /**
   * matchesReadyWebhook
   * ------------------------------------------------------------
   * Summary:
   * - Accepts a batch of ready matches and saves missing pairs to DB.
   *
   * Payload:
   * {
   *   batch_id: UUID,
   *   matches: [
   *     { user_a_id: UUID, user_a_designation?: string,
   *       user_b_id: UUID, user_b_designation?: string },
   *     ...
   *   ]
   * }
   *
   * Steps:
   *  1) Validate input; normalize and de-duplicate pairs (order-independent).
   *  2) TX: ensure batch row exists (create if missing).
   *  3) TX: load existing pairs for this batch; build a canonical Set.
   *  4) TX: insert only missing pairs using provided A/B + designations.
   *  5) Return summary (inserted, skipped, items).
   */
  async matchesReadyWebhook(body: MatchesReadyWebhookDto) {
    this.logger.log('++++++++ MATCHES FOUND WEBHOOK ++++++++');
    this.logger.log({ timestamp: new Date(Date.now()) });
    this.logger.log({ body });

    const { batch_id, matches } = body || ({} as MatchesReadyWebhookDto);
    if (!batch_id || !Array.isArray(matches)) {
      throw new BadRequestException('batch_id and matches[] are required');
    }

    // Helper: canonical key so A|B == B|A
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

    // 1) Normalize + de-duplicate incoming pairs
    type InPair = {
      user_a_id: string;
      user_b_id: string;
      user_a_designation?: string | null;
      user_b_designation?: string | null;
      match_score?: number | null;
      explanation?: string | null;
      match_tier?: string | null;
      synergy_areas?: string[] | null;
      friction_points?: string[] | null;
      talking_points?: string[] | null;
      headline?: string | null;
      key_points?: string[] | null;
      score_breakdown?: Record<string, number> | null;
      reciprocal?: boolean | null;
    };

    const incoming: InPair[] = [];
    const seenIncoming = new Set<string>();
    const allUserIds = new Set<string>();
    this.logger.log({ matches_length: matches.length });
    if (matches.length > 0) {
      for (const m of matches) {
        const ua = m?.user_a_id?.trim?.();
        const ub = m?.user_b_id?.trim?.();
        if (!ua || !ub || ua === ub) continue; // skip invalid/self pairs

        const k = pairKey(ua, ub);
        if (seenIncoming.has(k)) continue;
        seenIncoming.add(k);

        incoming.push({
          user_a_id: ua,
          user_b_id: ub,
          user_a_designation: m?.user_a_designation ?? null,
          user_b_designation: m?.user_b_designation ?? null,
          match_score: (m as any)?.match_score ?? null,
          explanation: (m as any)?.explanation ?? null,
          match_tier: (m as any)?.match_tier ?? null,
          synergy_areas: (m as any)?.synergy_areas ?? null,
          friction_points: (m as any)?.friction_points ?? null,
          talking_points: (m as any)?.talking_points ?? null,
          headline: (m as any)?.headline ?? null,
          key_points: (m as any)?.key_points ?? null,
          score_breakdown: (m as any)?.score_breakdown ?? null,
          // Apr-17 Phase 2: reciprocal flag from AI matching (da246c3).
          // Value semantics:
          //   true  → Primary match (direct value exchange via primary_goal)
          //   false → Adjacent match (SOFT-fallback backfill candidate)
          //   null  → not evaluable (unknown goal / missing slot / legacy)
          reciprocal: (m as any)?.reciprocal ?? null,
        });

        allUserIds.add(ua);
        allUserIds.add(ub);
      }

      if (incoming.length === 0) {
        throw new BadRequestException('matches[] must contain at least one valid pair');
      }

      const todayUtcYYYYMMDD = new Date().toISOString().slice(0, 10);

      // 2–4) Transaction for DB writes
      const createdRows = await this.sequelize.transaction(async (tx: Transaction) => {
        const now = new Date();

        // 2) Ensure batch exists
        const existingBatch = await this.matchBatchModel.findByPk(batch_id, {
          transaction: tx,
          raw: true,
        });

        if (!existingBatch) {
          await this.matchBatchModel.create(
            {
              id: batch_id,
              status: MatchBatchStatusEnum.COMPLETED, // batch delivered/ready
              match_date: todayUtcYYYYMMDD,
              data: {},
              created_at: now,
              updated_at: now,
            },
            { transaction: tx },
          );
        }

        // 2b) Look up objectives from users table for all involved users
        const ids = [...allUserIds];
        const usersWithObjectives = await this.userModel.findAll({
          where: { id: { [Op.in]: ids } },
          attributes: ['id', 'objective'],
          raw: true,
          transaction: tx,
        });
        const objectiveById = new Map<string, string>();
        for (const u of usersWithObjectives) {
          if (u.objective) objectiveById.set(u.id, u.objective);
        }

        // 3) Identify the source user (user_a_id is consistent across all pairs).
        //    UPSERT by (user_a_id, user_b_id) instead of clear+bulkCreate, so match
        //    IDs are preserved across Phase 2 explanation-backfill re-syncs.
        //
        //    Apr-19 (Brian Limba test): previous clear+insert pattern caused every
        //    Phase 2 batch sync to replace all 14 match IDs, invalidating any frontend
        //    match list loaded mid-backfill. User saw "Unable to load explanation"
        //    because GET /dashboard/match-explanation/:oldId returned 404 against a
        //    refreshed row set. UPSERT fixes this: stable IDs + user decisions
        //    (approved/passed) and user_feedback preserved across re-syncs.
        //
        //    Scope: we only touch matches where user_a_id = sourceUserId (the ones
        //    this sync is authoritative for). Matches where the source user appears
        //    as user_b_id belong to OTHER users' match lists and get refreshed by
        //    their own syncs — leaving them alone eliminates the previous [Op.or]
        //    reverse-direction deletion (which caused cross-user match-list churn).
        const sourceUserId = incoming[0]?.user_a_id;
        let upserted: Match[] = [];

        if (sourceUserId) {
          // 3a) Fetch existing matches for this source user
          const existing = await this.matchModel.findAll({
            where: { user_a_id: sourceUserId },
            transaction: tx,
          });
          const existingByPartnerId = new Map<string, Match>(
            existing.map(m => [m.user_b_id, m]),
          );

          // 3b) Build incoming partner-id set for cleanup step
          const incomingPartnerIds = new Set(incoming.map(p => p.user_b_id));

          // 3c) Upsert each incoming pair — preserve id + user decisions + feedback
          //     for existing pairs; insert fresh for new pairs.
          const rowsToInsert: any[] = [];
          for (const p of incoming) {
            const prior = existingByPartnerId.get(p.user_b_id);
            const mutableFields = {
              batch_id,
              user_a_persona_compatibility_score: p.match_score ?? 50,
              user_b_persona_compatibility_score: p.match_score ?? 50,
              user_a_designation: p.user_a_designation ?? null,
              user_b_designation: p.user_b_designation ?? null,
              user_a_objective: objectiveById.get(p.user_a_id) ?? null,
              user_b_objective: objectiveById.get(p.user_b_id) ?? null,
              explanation: p.explanation ? {
                summary: p.explanation,
                headline: (p as any).headline ?? '',
                key_points: (p as any).key_points ?? [],
                generated_at: now.toISOString(),
              } : null,
              match_tier: p.match_tier ?? null,
              synergy_areas: p.synergy_areas ?? [],
              friction_points: p.friction_points ?? [],
              talking_points: p.talking_points ?? [],
              score_breakdown: (p as any).score_breakdown ?? null,
              reciprocal: (p as any).reciprocal ?? null,
              updated_at: now,
            };

            if (prior) {
              // UPDATE — preserve id, created_at, user_*_decision, user_*_feedback,
              // ai_remarks_after_chat, status, user_to_user_conversation
              await prior.update(mutableFields, { transaction: tx });
              upserted.push(prior);
            } else {
              // INSERT — collect for a single bulkCreate below
              rowsToInsert.push({
                ...mutableFields,
                user_a_id: p.user_a_id,
                user_b_id: p.user_b_id,
                user_a_feedback: null,
                user_b_feedback: null,
                user_a_decision: MatchStatusEnum.PENDING,
                user_b_decision: MatchStatusEnum.PENDING,
                ai_remarks_after_chat: null,
                user_to_user_conversation: false,
                status: MatchStatusEnum.PENDING,
                perfect_match: false,
                created_at: now,
              });
            }
          }

          // 3d) Insert the new pairs (ones that weren't in the prior set)
          if (rowsToInsert.length > 0) {
            const created = await this.matchModel.bulkCreate(
              rowsToInsert as any[],
              { returning: true, transaction: tx },
            );
            upserted = upserted.concat(created);
          }

          // 3e) Delete pairs that dropped out (existed before, not in incoming now)
          const toDelete = existing
            .filter(m => !incomingPartnerIds.has(m.user_b_id))
            .map(m => m.id);
          if (toDelete.length > 0) {
            await this.matchModel.destroy({
              where: { id: { [Op.in]: toDelete } },
              transaction: tx,
            });
            this.logger.log(
              `Removed ${toDelete.length} dropped pairs for source user ${sourceUserId}`,
            );
          }

          this.logger.log(
            `Upserted ${upserted.length} matches for source user ${sourceUserId} (${rowsToInsert.length} new, ${upserted.length - rowsToInsert.length} updated, ${toDelete.length} removed)`,
          );
        }

        this.logger.log({ rows_length: upserted.length });
        if (upserted.length === 0) return [] as Match[];
        const created = upserted;

        // daily analytics entry
        await this.dailyAnalyticsService.bumpToday('matches_total', {
          by: ids.length,
          transaction: tx,
        });
        // 5) insert activity logs (New Match Found)
        await Promise.allSettled(
          ids.map(uid =>
            this.userActivityLogsService.insertActivityLog(
              UserActivityEventsEnum.NEW_MATCHES_FOUND,
              uid,
              tx,
            ),
          ),
        );
        return created;
      });
    }

    return true;
  }

  /**
   * aiChatReadyWebhook
   * -----------------------------------------------------------
   * Summary:
   * - Persist an AI chat (conversation + messages) between two users, then notify both.
   *
   * Steps:
   * 1) Validate input (initiator_id, responder_id, match_id, messages[]).
   * 2) TX: find-or-create conversation (initiator -> user_a, responder -> user_b),
   *        bulk insert messages tied to the conversation.
   * 3) After commit: FCM to both users with API-like payload.
   *
   * Flow:
   * webhook → validate → TX(upsert conv + insert messages) → commit → FCM notify → return
   */
  async aiChatReadyWebhook(body: AiChatReadyDto) {
    this.logger.log('++++++++ AI CHAT READY WEBHOOK ++++++++');
    this.logger.log({ timestamp: new Date(Date.now()) });
    this.logger.log({ body });

    const {
      initiator_id,
      responder_id,
      match_id,
      conversation_data,
      ai_remarks,
      compatibility_score,
      // Phase 1.3: Rich AI Verdicts
      verdict_details,
      synergy_areas,
      friction_points,
      suggested_topics,
      recommended_next_step,
      confidence_level,
      ice_breaker,
    } = body || ({} as AiChatReadyDto);

    this.logger.log({ compatibility_score });
    this.logger.log({ ai_remarks });
    this.logger.log({ conversation_data });
    this.logger.log({ verdict_details });
    this.logger.log({ synergy_areas });

    // 1) basic validation
    if (
      !initiator_id ||
      !responder_id ||
      !match_id ||
      !Array.isArray(conversation_data) ||
      conversation_data.length === 0
    ) {
      throw new BadRequestException(
        'initiator_id, responder_id, match_id and conversation_data[] are required',
      );
    }

    // Make sure every message is authored by one of the two users
    const invalid = conversation_data.find(
      m => m?.sender_id !== initiator_id && m?.sender_id !== responder_id,
    );
    if (invalid)
      throw new BadRequestException(
        'messages[].sender_id must be either initiator_id or responder_id',
      );

    // 2) persist inside a transaction (initiator -> user_a, responder -> user_b)
    const { conversation, savedMessages } = await this.sequelize.transaction(
      async (tx: Transaction) => {
        // Idempotent-ish: reuse OPEN conversation for same pair + match_id if exists.
        let conv = await this.aiConversationModel.findOne({
          where: {
            user_a_id: initiator_id,
            user_b_id: responder_id,
            match_id,
            status: ConversationStatusEnum.OPEN,
          },
          transaction: tx,
        });
        this.logger.log({ existing_conversation: conv });

        if (conv) throw new BadRequestException('Conversation already exists');

        conv = await this.aiConversationModel.create(
          {
            user_a_id: initiator_id,
            user_b_id: responder_id,
            match_id,
            status: ConversationStatusEnum.OPEN,
            ai_remarks,
            compatibility_score,
            user_to_user_conversation: false,
            // Phase 1.3: Rich AI Verdicts
            verdict_details: verdict_details ?? null,
            synergy_areas: synergy_areas ?? [],
            friction_points: friction_points ?? [],
            suggested_topics: suggested_topics ?? [],
            recommended_next_step: recommended_next_step ?? null,
            confidence_level: confidence_level ?? null,
            ice_breaker: ice_breaker ?? null,
            created_at: new Date(),
            updated_at: new Date(),
          },
          { transaction: tx },
        );

        /**
         * Prepare message rows
         * --------------------
         * - Assign sort_order sequentially based on array index.
         * - Index 0 → sort_order = 1, index n → sort_order = n + 1.
         * - This makes ordering deterministic even if timestamps are same.
         */
        const now = new Date();
        const rows = conversation_data.map((m, index) => ({
          conversation_id: conv.id,
          sender_id: m.sender_id,
          content: m.content,
          metadata: m.metadata ?? null,
          sort_order: index + 1, // <--- NEW COLUMN FOR ORDERING
          created_at: now,
          updated_at: now,
        }));

        this.logger.log({ messages_count: rows.length });

        // Insert messages in bulk
        const created = await this.messageModel.bulkCreate(rows, { transaction: tx });

        // insert activity log (AI Chat Initiated)
        await this.userActivityLogsService.insertActivityLog(
          UserActivityEventsEnum.AI_TO_AI_CONVERSATION_INITIATED,
          initiator_id,
          tx,
        );
        await this.userActivityLogsService.insertActivityLog(
          UserActivityEventsEnum.AI_TO_AI_CONVERSATION_INITIATED,
          responder_id,
          tx,
        );

        // matches ai accepted/rejected, insert record for daily analytics
        if (Number(compatibility_score) >= 50) {
          await this.dailyAnalyticsService.bumpToday('matches_ai_accepted', {
            by: 1,
            transaction: tx,
          });
        } else {
          await this.dailyAnalyticsService.bumpToday('matches_ai_rejected', {
            by: 1,
            transaction: tx,
          });
        }

        /* reflect the compatibility scores & add ai-to-ai-chat boolean = true to the match */
        await this.matchModel.update(
          {
            // ai_to_ai_conversation: true,
            user_a_persona_compatibility_score: Number(compatibility_score),
            user_b_persona_compatibility_score: Number(compatibility_score),
            ai_remarks_after_chat:
              Number(compatibility_score) >= 50
                ? MatchStatusEnum.APPROVED
                : MatchStatusEnum.DECLINED,
          },
          { where: { id: match_id }, transaction: tx },
        );

        return { conversation: conv, savedMessages: created };
      },
    );

    /**
     * Ensure messages are sorted in payload as well, just in case
     * the DB or dialect returns them in a different order.
     */
    const sortedMessages = [...savedMessages].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );

    // 3) notify both users AFTER COMMIT
    // Build API-like data payload for frontend consumers
    const payload = {
      conversation: {
        id: conversation.id,
        match_id: conversation.match_id,
        user_a_id: conversation.user_a_id,
        user_b_id: conversation.user_b_id,
        status: conversation.status,
        ai_remarks: conversation.ai_remarks, // e.g., { tag: "Strong fit" }
        compatibility_score: conversation.compatibility_score ?? null,
        user_to_user_conversation: conversation.user_to_user_conversation,
        // Phase 1.3: Rich AI Verdicts
        verdict_details: conversation.verdict_details ?? null,
        synergy_areas: conversation.synergy_areas ?? [],
        friction_points: conversation.friction_points ?? [],
        suggested_topics: conversation.suggested_topics ?? [],
        recommended_next_step: conversation.recommended_next_step ?? null,
        confidence_level: conversation.confidence_level ?? null,
        ice_breaker: conversation.ice_breaker ?? null,
        messages: sortedMessages.map(m => ({
          id: m.id,
          sender_id: m.sender_id,
          content: m.content,
          metadata: m.metadata ?? null,
          sort_order: m.sort_order, // <--- expose to FE if helpful
          created_at: m.created_at,
        })),
      },
    };

    // FCM data-only message (keep symmetric for both users)
    const data: Record<string, string> = {
      type: 'AI_CHAT_READY',
      match_id: String(conversation.match_id),
      conversation_id: String(conversation.id),
      user_a_id: String(conversation.user_a_id),
      user_b_id: String(conversation.user_b_id),
      payload: JSON.stringify(payload),
    };

    // Send to initiator (user_a)
    const response1 = await this.notificationService.sendToUser(
      String(conversation.user_a_id),
      'New AI chat',
      'Tap to view conversation.',
      data,
    );
    this.logger.log({ response1 });

    // Send to responder (user_b)
    const response2 = await this.notificationService.sendToUser(
      String(conversation.user_b_id),
      'New AI chat',
      'Tap to view conversation.',
      data,
    );
    this.logger.log({ response2 });

    // Return an API-like response to the webhook caller as well
    return {
      code: 200,
      message: 'ok',
      result: {
        response1,
        response2,
      },
    };
  }

  async listUsersWebhook() {
    this.logger.log('++++++ LIST USERS WEBHOOK ++++++++++');
    this.logger.log({ timestamp: new Date(Date.now()) });

    const { count, rows } = await this.userModel.findAndCountAll({
      attributes: ['id', 'first_name', 'last_name', 'email'],
      include: [
        {
          association: 'role',
          required: true,
          where: { title: 'user' }, // <-- filter by role.title
          attributes: [],
        },
      ],
    });

    return { count, rows };
  }

  async isTheValueAnObject(value?: string | null): Promise<boolean> {
    if (!value) return false;

    // Fast check: JSON must start with { or [
    const firstChar = value.trim().charAt(0);
    if (firstChar !== '{' && firstChar !== '[') {
      return false; // plain string
    } else {
      return true;
    }
  }

  async getUserDataWebhook(userId: string) {
    this.logger.log('++++++ GET USER DATA WEBHOOK ++++++++++');
    this.logger.log({ timestamp: new Date(Date.now()) });

    const answerData = await this.onboardingService.getOnboardingAnswersData(userId);
    if (!answerData) throw new BadRequestException('data not found');

    let resumeLink: any = '';
    const questions: any[] = [];

    // build payload from enriched answers
    // Use q.prompt (stored directly on answer row) as fallback when onboarding_question is null
    for (const q of answerData as any[]) {
      const isObject: boolean = await this.isTheValueAnObject(q.user_response);
      if (isObject) resumeLink = JSON.parse(q.user_response)?.resume;
      // Fix: Use prompt from answer row directly, fallback to onboarding_question.prompt
      const prompt = q.prompt || q.onboarding_question?.prompt || 'Unknown';
      questions.push({ prompt, answer: q.user_response });
    }
    //}
    return {
      user_id: userId,
      resume_link: resumeLink?.url ?? resumeLink,
      questions,
    };
  }

  /**
   * clearAllMatches
   * Summary:
   * - Deletes all matches from the database.
   * - Used when resyncing matches from AI service.
   */
  async clearAllMatches() {
    this.logger.log('++++++ CLEAR ALL MATCHES ++++++++++');
    this.logger.log({ timestamp: new Date(Date.now()) });

    // Count before delete
    const countBefore = await this.matchModel.count();

    // Delete all matches
    const deleted = await this.matchModel.destroy({ where: {} });

    this.logger.log(`Deleted ${deleted} matches (was ${countBefore})`);

    return {
      success: true,
      deleted: deleted,
      count_before: countBefore,
      message: `Cleared ${deleted} matches from database`,
    };
  }

  /**
   * verifyUsersByEmail
   * Summary:
   * - Marks users as email verified by their email addresses.
   * - Temporary endpoint for testing/admin purposes.
   */
  async verifyUsersByEmail(emails: string[]) {
    this.logger.log('++++++ VERIFY USERS BY EMAIL ++++++++++');
    this.logger.log({ emails, timestamp: new Date(Date.now()) });

    // Update all users with matching emails
    const [affectedCount] = await this.userModel.update(
      { is_email_verified: true },
      { where: { email: emails } },
    );

    this.logger.log(`Verified ${affectedCount} users`);

    return {
      success: true,
      verified: affectedCount,
      emails: emails,
      message: `Verified ${affectedCount} users`,
    };
  }

  /**
   * handleSesEvent
   * -----------------------------------------------------------
   * Process a single SES notification delivered via SNS.
   * Event shape is the SES "Notification" JSON documented at
   * https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html
   *
   * Permanent bounces   -> is_email_verified=false + email_notifications=false
   *                       (we can't reach them; stop sending)
   * Transient bounces   -> no DB change (may recover; SES auto-retries + suppression list handles it)
   * Complaints          -> email_notifications=false (user marked us as spam)
   * Delivery events     -> log only
   * All others          -> log only
   *
   * SES already auto-suppresses hard-bounced addresses at the account level,
   * so this handler's primary purpose is in-app UX (surfacing the state to
   * the user) + stopping the weekly digest + tracing for operations.
   */
  async handleSesEvent(event: any): Promise<{ status: string; affected?: number }> {
    const type = event?.eventType || event?.notificationType || 'unknown';
    const mail = event?.mail || {};
    const source = mail?.source;
    const messageId = mail?.messageId;
    this.logger.log(`[SES] event=${type} messageId=${messageId} source=${source}`);

    if (type === 'Bounce') {
      const bounceType = event?.bounce?.bounceType; // 'Permanent' | 'Transient' | 'Undetermined'
      const recipients: Array<{ emailAddress?: string }> =
        event?.bounce?.bouncedRecipients || [];
      if (bounceType !== 'Permanent') {
        this.logger.log(`[SES] transient bounce for ${recipients.length} recipient(s); no DB change`);
        return { status: 'logged', affected: 0 };
      }
      let affected = 0;
      for (const r of recipients) {
        const addr = (r.emailAddress || '').toLowerCase();
        if (!addr) continue;
        const [count] = await this.userModel.update(
          { is_email_verified: false, email_notifications: false },
          { where: { email: addr } },
        );
        affected += count;
        this.logger.warn(`[SES] hard-bounce: ${addr} (rows_updated=${count})`);
      }
      return { status: 'bounce_processed', affected };
    }

    if (type === 'Complaint') {
      const recipients: Array<{ emailAddress?: string }> =
        event?.complaint?.complainedRecipients || [];
      const feedback = event?.complaint?.complaintFeedbackType || 'unknown';
      let affected = 0;
      for (const r of recipients) {
        const addr = (r.emailAddress || '').toLowerCase();
        if (!addr) continue;
        const [count] = await this.userModel.update(
          { email_notifications: false },
          { where: { email: addr } },
        );
        affected += count;
        this.logger.warn(`[SES] complaint (${feedback}): ${addr} (rows_updated=${count})`);
      }
      return { status: 'complaint_processed', affected };
    }

    if (type === 'Delivery') {
      const recipients: string[] = event?.delivery?.recipients || [];
      this.logger.log(`[SES] delivery confirmed for ${recipients.length} recipient(s)`);
      return { status: 'logged', affected: 0 };
    }

    this.logger.log(`[SES] unhandled event type: ${type}`);
    return { status: 'ignored', affected: 0 };
  }
}
