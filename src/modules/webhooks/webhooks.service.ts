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
   * - Persist a new version of user's AI summary, then notify user.
   *
   * Steps:
   * 1) Validate input (userId + summary).
   * 2) TX: read latest version → create next version as "draft".
   * 3) After commit: send FCM data-only message to the user.
   *
   * Flow:
   * webhook → validate → TX(create summary) → commit → FCM notify → return true
   */
  async summaryReadyWebhook(body: SummaryReadyDto) {
    this.logger.log('++++++ SUMMARY READY WEBHOOK ++++++++++');
    this.logger.log({ timestamp: new Date(Date.now()) });
    this.logger.log({ body });

    const { user_id, summary } = body || ({} as SummaryReadyDto);

    if (!user_id || !summary) {
      throw new BadRequestException('user_id, summary_id and summary are required');
    }

    // 1–2) persist inside a transaction
    const { version, summaryStr, summaryId } = await this.sequelize.transaction(
      async (tx: Transaction) => {
        const latest: any = await this.userSummaryModel.findOne({
          where: { user_id },
          attributes: ['version'],
          order: [['version', 'DESC']],
          raw: true,
          transaction: tx,
        });

        const nextVersion = (latest?.version ?? 0) + 1;
        const serialized = JSON.stringify(summary ?? {});

        const summaryRecord = await this.userSummaryModel.create(
          {
            user_id,
            summary: serialized,
            status: 'draft',
            version: nextVersion,
          },
          { transaction: tx },
        );

        const summaryId = (summaryRecord as any)?.id;
        this.logger.log({ summary_id: summaryId });

        return { version: nextVersion, summaryStr: serialized, summaryId };
      },
    );
    //const ouser_id = 987
    // 3) notify after successful commit (Socket.IO)
    this.realtimeEvents.emitToUser(String(user_id), 'summary.ready', {
      type: 'SUMMARY_READY',
      userId: String(user_id),
      version: String(version),
      summaryId: String(summaryId),
      summary: summaryStr, // you can remove this if payload is too big
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

    // 2) collect targets and optional designations
    const byId = new Map<string, string | null>();
    if (matches.length > 0) {
      for (const m of matches) {
        if (m?.target_user_id) byId.set(m.target_user_id, m.target_user_designation ?? null);
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
            user_a_persona_compatibility_score: null,
            user_b_persona_compatibility_score: null,
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

        // 3) Load existing pairs for this batch; restrict by involved user ids
        const ids = [...allUserIds];
        const existingPairs = await this.matchModel.findAll({
          where: {
            // batch_id,
            //[Op.or]: [{ user_a_id: { [Op.in]: ids } }, { user_b_id: { [Op.in]: ids } }],
            user_a_id: { [Op.in]: ids },
            user_b_id: { [Op.in]: ids },
          },
          attributes: ['user_a_id', 'user_b_id'],
          raw: true,
          transaction: tx,
        });

        const existingSet = new Set<string>(
          existingPairs.map(e => pairKey(e.user_a_id, e.user_b_id)),
        );

        // 4) Prepare only missing rows (use provided A/B orientation as-is)
        const rows = incoming
          .filter(p => !existingSet.has(pairKey(p.user_a_id, p.user_b_id)))
          .map(p => ({
            batch_id,
            user_a_id: p.user_a_id,
            user_b_id: p.user_b_id,
            user_a_feedback: null,
            user_b_feedback: null,
            user_a_persona_compatibility_score: null,
            user_b_persona_compatibility_score: null,
            user_a_decision: MatchStatusEnum.PENDING,
            user_b_decision: MatchStatusEnum.PENDING,
            user_a_designation: p.user_a_designation ?? null,
            user_b_designation: p.user_b_designation ?? null,
            user_a_objective: null,
            user_b_objective: null,
            ai_remarks_after_chat: null,
            user_to_user_conversation: false,
            status: MatchStatusEnum.PENDING,
            perfect_match: false,
            created_at: now,
            updated_at: now,
          }));

        this.logger.log({ rows_length: rows.length });
        if (rows.length === 0) return [] as Match[];
        const created = await this.matchModel.bulkCreate(rows, {
          returning: true,
          transaction: tx,
        });

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
      const isObject: Boolean = await this.isTheValueAnObject(q.user_response);
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
}
