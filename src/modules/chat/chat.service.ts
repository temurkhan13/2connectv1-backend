import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, literal, fn, col } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ChatConversation } from 'src/common/entities/chat-conversation.entity';
import { ChatMessage } from 'src/common/entities/chat-message.entity';
import { BlockedUser } from 'src/common/entities/blocked-user.entity';
import { ReportedUser } from 'src/common/entities/reported-user.entity';
import { User } from 'src/common/entities/user.entity';
import { NotificationService } from 'src/modules/notifications/notification.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(ChatConversation)
    private conversationModel: typeof ChatConversation,
    @InjectModel(ChatMessage)
    private messageModel: typeof ChatMessage,
    @InjectModel(BlockedUser)
    private blockedUserModel: typeof BlockedUser,
    @InjectModel(ReportedUser)
    private reportedUserModel: typeof ReportedUser,
    private sequelize: Sequelize,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Get or create a conversation between two users.
   * Always stores user IDs in sorted order to prevent duplicates.
   */
  async getOrCreateConversation(
    userId: string,
    otherUserId: string,
    matchId?: string,
  ): Promise<ChatConversation> {
    // Sort IDs to ensure consistent ordering (prevents duplicate conversations)
    const [user1Id, user2Id] = [userId, otherUserId].sort();

    // Check for existing conversation
    let conversation = await this.conversationModel.findOne({
      where: { user1_id: user1Id, user2_id: user2Id },
    });

    if (!conversation) {
      conversation = await this.conversationModel.create({
        user1_id: user1Id,
        user2_id: user2Id,
        match_id: matchId || null,
      });
      this.logger.log(`Created new conversation ${conversation.id} between ${user1Id} and ${user2Id}`);
    }

    return conversation;
  }

  /**
   * Get all conversations for a user, with last message preview.
   */
  async getUserConversations(userId: string): Promise<any[]> {
    const conversations = await this.conversationModel.findAll({
      where: {
        [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
      },
      order: [['last_message_at', 'DESC NULLS LAST'], ['created_at', 'DESC']],
      include: [
        { model: User, as: 'user1', attributes: ['id', 'first_name', 'last_name', 'avatar'] },
        { model: User, as: 'user2', attributes: ['id', 'first_name', 'last_name', 'avatar'] },
      ],
    });

    // Enrich each conversation with last message and unread count
    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        // Decrypt last message content (parameterized)
        const [lastMsgRows] = await this.sequelize.query(`
          SELECT id, conversation_id, sender_id, decrypt_message(content) as content,
                 message_type, read_at, created_at
          FROM chat_messages WHERE conversation_id = :convId
          ORDER BY created_at DESC LIMIT 1
        `, { replacements: { convId: conv.id } });
        const lastMessage = (lastMsgRows as any[])[0] || null;

        const unreadCount = await this.messageModel.count({
          where: {
            conversation_id: conv.id,
            sender_id: { [Op.ne]: userId },
            read_at: null,
          },
        });

        // Determine the other user
        const otherUser = conv.user1_id === userId ? conv.user2 : conv.user1;

        return {
          id: conv.id,
          otherUser: otherUser
            ? {
                id: otherUser.id,
                firstName: otherUser.first_name,
                lastName: otherUser.last_name,
                avatar: otherUser.avatar,
              }
            : null,
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                senderId: lastMessage.sender_id,
                createdAt: lastMessage.created_at,
                type: lastMessage.message_type,
              }
            : null,
          unreadCount,
          matchId: conv.match_id,
          createdAt: conv.created_at,
          lastMessageAt: conv.last_message_at,
        };
      }),
    );

    return enriched;
  }

  /**
   * Get messages for a conversation with pagination.
   */
  async getMessages(
    conversationId: string,
    userId: string,
    limit: number = 50,
    before?: string,
  ): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
    // Verify user is part of conversation
    const conversation = await this.conversationModel.findByPk(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.user1_id !== userId && conversation.user2_id !== userId) {
      throw new ForbiddenException('Not a member of this conversation');
    }

    // Use raw query to decrypt content at rest (parameterized)
    const beforeClause = before ? 'AND created_at < :before' : '';
    const replacements: any = { convId: conversationId, lim: limit + 1 };
    if (before) replacements.before = before;

    const [messages] = await this.sequelize.query(`
      SELECT id, conversation_id, sender_id,
             decrypt_message(content) as content,
             message_type, read_at, created_at,
             attachment_url, attachment_name, attachment_size
      FROM chat_messages
      WHERE conversation_id = :convId ${beforeClause}
      ORDER BY created_at DESC
      LIMIT :lim
    `, { replacements });

    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(0, limit) : messages;

    return { messages: (result as ChatMessage[]).reverse(), hasMore };
  }

  /**
   * Send a message in a conversation.
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    messageType: 'text' | 'image' | 'system' = 'text',
    attachmentUrl?: string,
    attachmentName?: string,
    attachmentSize?: number,
  ): Promise<ChatMessage> {
    // Verify sender is part of conversation
    const conversation = await this.conversationModel.findByPk(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.user1_id !== senderId && conversation.user2_id !== senderId) {
      throw new ForbiddenException('Not a member of this conversation');
    }

    // Check if either user has blocked the other
    const otherId = conversation.user1_id === senderId ? conversation.user2_id : conversation.user1_id;
    if (await this.isBlocked(senderId, otherId)) {
      throw new ForbiddenException('Cannot send messages — user is blocked');
    }

    // Encrypt content at rest using pgcrypto via raw SQL (safe parameterized query)
    const [insertResult] = await this.sequelize.query(
      `INSERT INTO chat_messages (id, conversation_id, sender_id, content, message_type, attachment_url, attachment_name, attachment_size, created_at)
       VALUES (gen_random_uuid(), :convId, :senderId, encrypt_message(:content), :msgType, :attUrl, :attName, :attSize, NOW())
       RETURNING id, conversation_id, sender_id, decrypt_message(content) as content, message_type, read_at, created_at, attachment_url, attachment_name, attachment_size`,
      {
        replacements: {
          convId: conversationId,
          senderId: senderId,
          content: content,
          msgType: messageType,
          attUrl: attachmentUrl || null,
          attName: attachmentName || null,
          attSize: attachmentSize || null,
        },
      }
    );
    const message = (insertResult as any[])[0] as ChatMessage;

    // Update conversation's last_message_at
    await conversation.update({ last_message_at: message.created_at });

    this.logger.log(`Message sent in conversation ${conversationId} by ${senderId}`);

    // Update user's last_active_at for freshness scoring (fire-and-forget)
    this.sequelize.query(
      `UPDATE user_summaries SET last_active_at = NOW() WHERE user_id = :userId`,
      { replacements: { userId: senderId } },
    ).catch(() => {});

    // Send push notification to the other user (fire-and-forget)
    const recipientId = conversation.user1_id === senderId ? conversation.user2_id : conversation.user1_id;
    this.sendMessagePush(senderId, recipientId, content, conversationId)
      .catch(err => this.logger.error(`Failed to send chat push: ${err}`));

    return message;
  }

  /**
   * Send push notification for a new chat message.
   */
  private async sendMessagePush(
    senderId: string,
    recipientId: string,
    content: string,
    conversationId: string,
  ): Promise<void> {
    // Get sender name for notification
    const [senderRows] = await this.sequelize.query(
      `SELECT first_name FROM users WHERE id = :senderId LIMIT 1`,
      { replacements: { senderId } },
    );
    const senderName = (senderRows as any[])[0]?.first_name || 'Someone';

    // Truncate message for notification body
    const preview = content.length > 80 ? content.substring(0, 80) + '...' : content;

    await this.notificationService.sendToUser(
      recipientId,
      `${senderName}`,
      preview,
      {
        type: 'new_message',
        conversation_id: conversationId,
        sender_id: senderId,
        screen: 'chat',
      },
    );
  }

  /**
   * Mark all messages in a conversation as read (messages sent by the other user).
   */
  async markAsRead(conversationId: string, userId: string): Promise<number> {
    const conversation = await this.conversationModel.findByPk(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.user1_id !== userId && conversation.user2_id !== userId) {
      throw new ForbiddenException('Not a member of this conversation');
    }

    const [updatedCount] = await this.messageModel.update(
      { read_at: new Date() },
      {
        where: {
          conversation_id: conversationId,
          sender_id: { [Op.ne]: userId },
          read_at: null,
        },
      },
    );

    return updatedCount;
  }

  /**
   * Get total unread message count across all conversations for a user.
   */
  async getTotalUnreadCount(userId: string): Promise<number> {
    const conversations = await this.conversationModel.findAll({
      where: {
        [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
      },
      attributes: ['id'],
    });

    if (conversations.length === 0) return 0;

    const conversationIds = conversations.map((c) => c.id);

    return this.messageModel.count({
      where: {
        conversation_id: { [Op.in]: conversationIds },
        sender_id: { [Op.ne]: userId },
        read_at: null,
      },
    });
  }

  /**
   * Block a user. Blocked users cannot send messages to blocker.
   */
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    await this.blockedUserModel.findOrCreate({
      where: { blocker_id: blockerId, blocked_id: blockedId },
      defaults: { blocker_id: blockerId, blocked_id: blockedId },
    });
    this.logger.log(`User ${blockerId} blocked ${blockedId}`);
  }

  /**
   * Unblock a user.
   */
  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await this.blockedUserModel.destroy({
      where: { blocker_id: blockerId, blocked_id: blockedId },
    });
  }

  /**
   * Check if a user is blocked by another user.
   */
  async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    const block = await this.blockedUserModel.findOne({
      where: {
        [Op.or]: [
          { blocker_id: userId1, blocked_id: userId2 },
          { blocker_id: userId2, blocked_id: userId1 },
        ],
      },
    });
    return !!block;
  }

  /**
   * Get list of users blocked by this user.
   */
  async getBlockedUsers(userId: string): Promise<string[]> {
    const blocks = await this.blockedUserModel.findAll({
      where: { blocker_id: userId },
      attributes: ['blocked_id'],
    });
    return blocks.map((b) => b.blocked_id);
  }

  /**
   * Report a user.
   */
  async reportUser(
    reporterId: string,
    reportedId: string,
    reason: string,
    details?: string,
    conversationId?: string,
  ): Promise<void> {
    await this.reportedUserModel.create({
      reporter_id: reporterId,
      reported_id: reportedId,
      reason,
      details: details || null,
      conversation_id: conversationId || null,
    });
    this.logger.log(`User ${reporterId} reported ${reportedId}: ${reason}`);
  }

  /**
   * Delete a conversation and all its messages.
   */
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationModel.findByPk(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.user1_id !== userId && conversation.user2_id !== userId) {
      throw new ForbiddenException('Not a member of this conversation');
    }

    // Delete all messages first, then conversation
    await this.messageModel.destroy({ where: { conversation_id: conversationId } });
    await conversation.destroy();
    this.logger.log(`Conversation ${conversationId} deleted by ${userId}`);
  }
}
