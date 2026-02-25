import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import axios, { AxiosError } from 'axios';
import { FindAndCountOptions, Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { Match } from 'src/common/entities/match.entity';
import { Message } from 'src/common/entities/message.entity';
import { User } from 'src/common/entities/user.entity';
import { UserActivityEventsEnum } from 'src/common/enums';
import { AIServiceFacade } from 'src/integration/ai-service/ai-service.facade';
import { UserFeedbackRequest } from 'src/integration/ai-service/types/requests.type';
import {
  InitiateAIChatDto,
  TriggerUserToUserDto,
} from 'src/modules/ai-conversations/dto/ai-conversation.dto';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';
import { UserActivityLogsService } from 'src/modules/user-activity-logs/user-activity-logs.service';
import { MatchStatusEnum } from 'src/common/enums';
import { MailService } from 'src/modules/mail/mail.service';

type AiServiceInitiateBody = {
  initiator_id: string; // caller (from JWT)
  responder_id: string; // dto.responder_id
  match_id: string; // dto.match_id
  template: string; // default ''
};

@Injectable()
export class AiConversationsService {
  private readonly logger = new Logger(AiConversationsService.name);
  constructor(
    @InjectModel(AiConversation)
    private readonly aiConversationModel: typeof AiConversation,
    private readonly mailService: MailService,
    @InjectModel(Message)
    private readonly messageModel: typeof Message,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Match)
    private readonly matchModel: typeof Match,
    private readonly sequelize: Sequelize,
    private readonly aiService: AIServiceFacade,
    private readonly userActivityLogsService: UserActivityLogsService,
    private readonly dailyAnalyticsService: DailyAnalyticsService,
  ) {}
  /**
   * initiateAIChat
   * --------------
   * Purpose:
   * - Build required payload for AI service and POST to `/user/initiate-ai-chat`.
   * - Returns the AI service response (pass-through). Keep controller thin.
   *
   * Inputs:
   * - userId: authenticated user id (initiator)
   * - dto: { match_id: UUID, responder_id: UUID, template?: string }
   *
   */
  async initiateAIChat(userId: string, dto: InitiateAIChatDto) {
    // 0) Env + URL setup (normalize trailing slashes)
    this.logger.log(`----- INITIATE AI CHAT -----`);
    this.logger.log({ user_id: userId });
    await this.sequelize.transaction(async (tx: Transaction) => {
      const _match = await this.matchModel.findOne({
        where: { id: dto.match_id, ai_to_ai_conversation: true },
        transaction: tx,
      });

      if (_match) throw new BadRequestException('AI Chat already initiated.');

      await this.matchModel.update(
        {
          ai_to_ai_conversation: true,
        },
        { where: { id: dto.match_id }, transaction: tx },
      );

      // insert record for daily analytics
      await this.dailyAnalyticsService.bumpToday('conversations_ai_to_ai', {
        by: 1,
        transaction: tx,
      });
    });
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http';
    if (!aiServiceUrl) {
      throw new InternalServerErrorException('AI service URL not configured');
    }
    const apiKey = process.env.AI_SERVICE_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException('AI service API key not configured');
    }
    const base = aiServiceUrl.replace(/\/+$/, '');
    const url = `${base}/user/initiate-ai-chat`; // normalized (avoid accidental double slashes)

    // 1) Build body exactly as the third-party expects
    const params: AiServiceInitiateBody = {
      initiator_id: userId,
      responder_id: dto.responder_id,
      match_id: dto.match_id,
      template: dto.template ?? '', // default to empty string if missing
    };

    try {
      const resp = await axios.post(url, params, {
        headers: {
          'X-Api-Key': apiKey, // header name per spec
          // Axios auto-sets Content-Type for plain objects
        },
        timeout: 60_000, // AI chat can take 30+ seconds with OpenAI
      });
      this.logger.log({
        response_from_inititate_ai_chat_ai_service: {
          status: resp.status,
          data: resp.data,
        },
      });
      // Pass-through upstream response (or shape here if you prefer)
      return resp.data;
    } catch (err) {
      const e = err as AxiosError<any>;
      // Log enough details for debugging without leaking secrets
      this.logger.error('[AI Initiate Chat] Upstream error', e.message);

      // Map to a clean 502 for callers; include upstream details when available
      throw new BadGatewayException({
        message: 'Failed to initiate AI chat',
        upstream_status: e.response?.status ?? null,
        upstream_error: e.response?.data ?? e.message,
      });
    }
  }

  /**
   * getAIConversations (compact)
   * - Only returns: id, other_person_id, other_person_name, last_message
   * - Paged and ordered by created_at DESC
   * - Last message is picked based on messages.sort_order DESC
   */
  async getAIConversations(userId: string, page = 1, limit = 20) {
    this.logger.log(`----- GET CONVERSATIONS -----`);
    this.logger.log({ user_id: userId });

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const offset = (safePage - 1) * safeLimit;

    const options: FindAndCountOptions = {
      where: {
        [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }],
      },
      // we need user_a_id & user_b_id to compute "other"
      attributes: ['id', 'user_a_id', 'user_b_id', 'created_at'],
      order: [['created_at', 'DESC']],
      limit: safeLimit,
      offset,
      include: [
        {
          model: User,
          as: 'user_a',
          attributes: ['id', 'first_name', 'last_name'],
          required: false,
        },
        {
          model: User,
          as: 'user_b',
          attributes: ['id', 'first_name', 'last_name'],
          required: false,
        },
        {
          model: Message,
          as: 'messages',
          /**
           * We only need the latest message (by sort_order).
           * separate: true → runs a separate query per parent with its own order/limit.
           */
          attributes: ['id', 'content', 'created_at', 'sort_order'],
          separate: true,
          limit: 1,
          order: [
            ['sort_order', 'DESC'], // latest logical position in conversation
          ],
          required: false,
        },
      ],
    };

    const { rows, count } = await this.aiConversationModel.findAndCountAll(options);

    const data = rows.map((row: any) => {
      const amUserA = row.user_a_id === userId;
      const other = amUserA ? row.user_b : row.user_a;

      const other_person_id = other?.id ?? null;
      const other_person_name = other
        ? [other.first_name, other.last_name].filter(Boolean).join(' ').trim() || null
        : null;

      // last message picked according to sort_order DESC
      const last_message = row.messages?.[0]?.content ?? null;

      return {
        id: row.id,
        other_person_id,
        other_person_name,
        last_message,
      };
    });

    const total = count;
    const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
    };
  }

  /**
   * getAIConversationDetail
   * ----------------
   * - Ensures the user is part of the conversation (user_a or user_b).
   * - Returns other person identity + paginated messages.
   * - Ordered by sort_order ASC (oldest → newest) for chat display.
   */
  async getAIConversationDetail(userId: string, conversationId: string, page = 1, limit = 20) {
    this.logger.log(`----- GET CONVERSATION DETAIL -----`);
    this.logger.log({ user_id: userId });

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const offset = (safePage - 1) * safeLimit;

    // 1) Fetch conversation with both users (aliases must match model)
    const conv = await this.aiConversationModel.findOne({
      where: { id: conversationId },
      attributes: [
        'id',
        'user_a_id',
        'user_b_id',
        'user_a_feedback',
        'user_b_feedback',
        'compatibility_score',
        'match_id',
      ],
      include: [
        { model: User, as: 'user_a', attributes: ['id', 'first_name', 'last_name'] },
        { model: User, as: 'user_b', attributes: ['id', 'first_name', 'last_name'] },
      ],
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    // 2) AuthZ: user must be part of this conversation
    const isParticipant = conv.user_a_id === userId || conv.user_b_id === userId;
    if (!isParticipant) throw new ForbiddenException('Access denied');

    // 3) Compute “other person”
    let feedback_flag = false;
    const amUserA = conv.user_a_id === userId;
    if (amUserA) {
      if (conv.user_a_feedback) feedback_flag = true;
    } else {
      if (conv.user_b_feedback) feedback_flag = true;
    }

    const other = amUserA ? conv.user_b : conv.user_a;
    const other_person_id = other?.id ?? (amUserA ? conv.user_b_id : conv.user_a_id);
    const other_person_name = other
      ? [other.first_name, other.last_name].filter(Boolean).join(' ').trim() || null
      : null;

    // 4) Count total messages for pagination
    const total = await this.messageModel.count({
      where: { conversation_id: conversationId },
    });

    // 5) Fetch paginated messages (oldest → newest based on sort_order)
    const messages = await this.messageModel.findAll({
      where: { conversation_id: conversationId },
      attributes: ['id', 'sender_id', 'content', 'created_at', 'sort_order'],
      order: [
        ['sort_order', 'DESC'], // main ordering for chat
      ],
      limit: safeLimit,
      offset,
    });

    const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

    // pick last message in this page (newest in this page)
    const lastMessageInPage = messages.length > 0 ? messages[messages.length - 1] : null;

    return {
      meta: {
        id: conv.id,
        match_id: conv.match_id,
        is_ai_chat_feedback_submitted: feedback_flag,
        ai_agent_decision: Number(conv.compatibility_score) >= 50 ? 'Accepted' : 'Declined',
        goals_compatibility_score: Number(conv.compatibility_score),
        other_person_id,
        other_person_name,
        conversation_ended_on: lastMessageInPage ? lastMessageInPage.created_at : null,
      },
      data: messages.map(m => (typeof m.toJSON === 'function' ? m.toJSON() : m)),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
    };
  }

  /**
   * Save feedback for an AI chat from the calling user.
   * - Looks up the AI chat by id.
   * - Detects if the user is user_a or user_b.
   * - Updates the correct feedback column (user_a_feedback or user_b_feedback).
   * - Sends feedback to AI service for learning.
   *
   * @param userId    UUID of the user giving feedback
   * @param aiChatId  UUID of the AI chat
   * @param feedback  Free-text feedback (non-empty)
   * @returns the updated AI conversation (plain object)
   */
  async submitAiChatFeedback(userId: string, aiChatId: string, feedback: string) {
    this.logger.log(`----- SUBMIT AI CHAT FEEDBACK -----`);
    this.logger.log({ user_id: userId });

    // Use a short transaction for atomic read+update
    return this.sequelize.transaction(async (tx: Transaction) => {
      // 1) Find the AI chat (only needed columns)
      const conversation = await this.aiConversationModel.findOne({
        where: { id: aiChatId },
        attributes: ['id', 'user_a_id', 'user_b_id', 'user_a_feedback', 'user_b_feedback'],
        transaction: tx,
        rejectOnEmpty: false,
      });

      if (!conversation) {
        throw new NotFoundException('AI conversation not found');
      }

      // 2) Decide which feedback column to update
      const isUserA = conversation.user_a_id === userId;
      const isUserB = conversation.user_b_id === userId;

      if (!isUserA && !isUserB) {
        throw new ForbiddenException('You are not part of this conversation');
      }

      // 3) Prepare partial update
      const patch: Partial<AiConversation> = isUserA
        ? { user_a_feedback: feedback.trim() }
        : { user_b_feedback: feedback.trim() };

      // 4) Update record
      await this.aiConversationModel.update(patch, {
        where: { id: aiChatId },
        transaction: tx,
      });

      // 5) Send feedback to AI service (fire-and-forget)
      this.sendAiChatFeedbackToAI(userId, aiChatId, feedback).catch(error => {
        this.logger.log('Failed to send AI chat feedback:', error.message);
      });

      // 6) Return updated record (plain)
      const updated = await this.aiConversationModel.findOne({
        where: { id: aiChatId },
        attributes: ['id', 'user_a_id', 'user_b_id', 'user_a_feedback', 'user_b_feedback'],
        transaction: tx,
      });

      return updated!.get({ plain: true });
    });
  }

  /**
   * Trigger external user-to-user API for a match.
   * ------------------------------------------------
   * - Logs activity for both users.
   * - Increments daily analytics for user-to-user conversations.
   * - If all approval conditions are met:
   *    * ai_remarks_after_chat = 'approved'
   *    * status = 'approved'
   *    * user_a_decision = 'approved'
   *    * user_b_decision = 'approved'
   *    * ai_to_ai_conversation = true
   *   then also marks the match as a perfect_match.
   * - Otherwise only marks user_to_user_conversation = true.
   */
  async triggerUserToUser(initiator_id: string, dto: TriggerUserToUserDto) {
    this.logger.log(`----- TRIGGER USER TO USER CHAT -----`);
    this.logger.log({ initiator_id });
    const { responder_id, match_id } = dto;
    this.logger.log({ responder_id: dto.responder_id });
    await this.sequelize.transaction(async (tx: Transaction) => {
      // 1) Load match inside the transaction (optional: with row-level lock)
      const match = await this.matchModel.findOne({
        where: { id: match_id },
        transaction: tx,
        // lock: tx.LOCK.UPDATE as any, // uncomment if you want row lock
      });

      if (!match) {
        throw new NotFoundException('Match not found');
      }

      // 2) Check if this match qualifies as a "perfect match"
      const isPerfectMatch =
        match.ai_remarks_after_chat === MatchStatusEnum.APPROVED &&
        match.status === MatchStatusEnum.APPROVED &&
        match.user_a_decision === MatchStatusEnum.APPROVED &&
        match.user_b_decision === MatchStatusEnum.APPROVED &&
        match.ai_to_ai_conversation === true;
      this.logger.log({ is_perfect_match: isPerfectMatch });
      // 3) Insert activity logs for both users
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.USER_TO_USER_CONVERSATION_INITIATED,
        initiator_id,
        tx,
      );

      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.USER_TO_USER_CONVERSATION_INITIATED,
        responder_id,
        tx,
      );

      // 4) Bump daily analytics for user-to-user conversations
      await this.dailyAnalyticsService.bumpToday('conversations_user_to_user', {
        by: 1,
        transaction: tx,
      });

      // 5) Prepare update payload based on conditions
      const updatePayload: Partial<Match> = {
        user_to_user_conversation: true,
      };

      // If all conditions meet, also mark as perfect_match
      if (isPerfectMatch) {
        updatePayload.perfect_match = true;
      }

      // 6) Update the match record
      await this.matchModel.update(updatePayload, {
        where: { id: match_id },
        transaction: tx,
      });
      const responder = await this.userModel.findOne({
        where: { id: responder_id, email_notifications: true },
        attributes: ['id', 'email', 'first_name', 'last_name'],
        raw: true,
        nest: true,
        transaction: tx,
      });
      const sender = await this.userModel.findOne({
        where: { id: initiator_id },
        attributes: ['id', 'first_name'],
        raw: true,
        nest: true,
        transaction: tx,
      });
      if (responder && sender) {
        this.logger.log({ responder_email: responder.email });
        this.logger.log({ responder_first_name: responder.first_name });
        this.logger.log({ sender_first_name: sender.first_name });

        const response = await this.mailService.sendNewMessageEmail(
          responder.email,
          responder.first_name,
          sender.first_name,
        );
        this.logger.log({ response_from_user_to_user_email: response });
      }

      // (Optional) If you want analytics per perfect match, you could also:
      // if (isPerfectMatch) {
      //   await this.dailyAnalyticsService.bumpToday('matches_perfect', {
      //     by: 1,
      //     transaction: tx,
      //   });
      // }
    });

    return {
      code: 200,
      message: 'ok',
      result: {
        match_id: dto.match_id,
        initiator_id: initiator_id,
        responder_id: dto.responder_id,
      },
    };
  }

  /**
   * Send AI chat feedback to AI service
   * -----------------------------------
   * Private helper that sends the feedback to AI service for learning.
   *
   * @param userId User ID
   * @param aiChatId Conversation ID
   * @param feedback Feedback text
   */
  private async sendAiChatFeedbackToAI(userId: string, aiChatId: string, feedback: string) {
    this.logger.log(`----- SEND AI CHAT FEEDBACK -----`);
    this.logger.log({ user_id: userId });
    try {
      const request: UserFeedbackRequest = {
        user_id: userId,
        type: 'chat',
        id: aiChatId,
        feedback: feedback.trim(),
      };

      await this.aiService.submitFeedback(request);
    } catch (error) {
      throw error;
    }
  }
}
