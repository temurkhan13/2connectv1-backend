import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  /**
   * GET /chat/conversations
   * Get all conversations for the authenticated user.
   */
  @Get('conversations')
  async getConversations(@Req() req: any) {
    const userId = req.user.id || req.user.sub;
    const conversations = await this.chatService.getUserConversations(userId);
    return { success: true, data: conversations };
  }

  /**
   * POST /chat/conversations
   * Create or get a conversation with another user.
   */
  @Post('conversations')
  async createConversation(
    @Req() req: any,
    @Body() body: { otherUserId: string; matchId?: string },
  ) {
    const userId = req.user.id || req.user.sub;
    const conversation = await this.chatService.getOrCreateConversation(
      userId,
      body.otherUserId,
      body.matchId,
    );
    return { success: true, data: { conversationId: conversation.id } };
  }

  /**
   * GET /chat/conversations/:id/messages
   * Get messages for a conversation with cursor-based pagination.
   */
  @Get('conversations/:id/messages')
  async getMessages(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const userId = req.user.id || req.user.sub;
    const result = await this.chatService.getMessages(
      conversationId,
      userId,
      limit ? parseInt(limit, 10) : 50,
      before,
    );
    return { success: true, data: result };
  }

  /**
   * POST /chat/conversations/:id/messages
   * Send a message in a conversation.
   */
  @Post('conversations/:id/messages')
  async sendMessage(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Body() body: { content: string; messageType?: 'text' | 'image' | 'system' },
  ) {
    const userId = req.user.id || req.user.sub;
    const message = await this.chatService.sendMessage(
      conversationId,
      userId,
      body.content,
      body.messageType || 'text',
    );
    return { success: true, data: message };
  }

  /**
   * PATCH /chat/conversations/:id/read
   * Mark all messages in a conversation as read.
   */
  @Patch('conversations/:id/read')
  async markAsRead(@Req() req: any, @Param('id') conversationId: string) {
    const userId = req.user.id || req.user.sub;
    const count = await this.chatService.markAsRead(conversationId, userId);
    return { success: true, data: { markedRead: count } };
  }

  /**
   * GET /chat/unread-count
   * Get total unread message count across all conversations.
   */
  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const userId = req.user.id || req.user.sub;
    const count = await this.chatService.getTotalUnreadCount(userId);
    return { success: true, data: { unreadCount: count } };
  }
}
