import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { ChatConversation } from 'src/common/entities/chat-conversation.entity';
import { ChatMessage } from 'src/common/entities/chat-message.entity';
import { User } from 'src/common/entities/user.entity';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(ChatConversation)
    private conversationModel: typeof ChatConversation,
    @InjectModel(ChatMessage)
    private messageModel: typeof ChatMessage,
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
        const lastMessage = await this.messageModel.findOne({
          where: { conversation_id: conv.id },
          order: [['created_at', 'DESC']],
        });

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

    const whereClause: any = { conversation_id: conversationId };
    if (before) {
      whereClause.created_at = { [Op.lt]: before };
    }

    const messages = await this.messageModel.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: limit + 1, // Fetch one extra to check if there are more
    });

    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(0, limit) : messages;

    return { messages: result.reverse(), hasMore };
  }

  /**
   * Send a message in a conversation.
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    messageType: 'text' | 'image' | 'system' = 'text',
  ): Promise<ChatMessage> {
    // Verify sender is part of conversation
    const conversation = await this.conversationModel.findByPk(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.user1_id !== senderId && conversation.user2_id !== senderId) {
      throw new ForbiddenException('Not a member of this conversation');
    }

    const message = await this.messageModel.create({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      message_type: messageType,
    });

    // Update conversation's last_message_at
    await conversation.update({ last_message_at: message.created_at });

    this.logger.log(`Message sent in conversation ${conversationId} by ${senderId}`);

    return message;
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
}
