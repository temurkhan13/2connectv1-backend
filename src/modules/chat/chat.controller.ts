import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Logger,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import * as multer from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { S3Service } from 'src/common/utils/s3.service';

// Apr-20 F/u 37: chat attachments replace Supabase Storage (staging bucket)
// with S3 (production AWS). Allowed types cover common attach scenarios
// from the mobile picker: images, PDFs, plain text. Max size generous vs
// avatar (5MB) because chat supports richer docs.
const CHAT_ATTACHMENT_MIME = new Set<string>([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
  'application/pdf',
  'text/plain', 'text/csv', 'text/markdown',
]);
const CHAT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly s3: S3Service,
  ) {}

  /**
   * POST /chat/upload-attachment
   * Upload a chat file attachment to S3 and return its public URL.
   *
   * Replaces the prior Supabase Storage upload path (Apr-20 F/u 37) — mobile
   * app was hitting staging Supabase `chat-attachments` bucket. Now routes
   * through production AWS S3 via `S3Service` (same S3 bucket as avatars
   * under a distinct `chat/{conversationId}/` key prefix).
   *
   * Inputs: JWT, multipart/form-data with `file`, body `conversationId`.
   * Returns: { url, key, size, contentType }.
   */
  @Post('upload-attachment')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: CHAT_ATTACHMENT_MAX_BYTES },
      fileFilter: (req, file, cb) => {
        if (!CHAT_ATTACHMENT_MIME.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}. Allowed: images, PDF, plain text.`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadAttachment(
    @UploadedFile() file: Express.Multer.File,
    @Body('conversationId') conversationId: string,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('File too large (max 20 MB)');
    }
    if (!conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    const result = await this.s3.uploadBuffer({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      keyPrefix: `chat/${conversationId}/`,
      acl: 'public-read',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    return {
      success: true,
      data: {
        url: result.url,
        key: result.key,
        size: file.size,
        contentType: file.mimetype,
      },
    };
  }

  /**
   * GET /chat/conversations
   * Get all conversations for the authenticated user.
   */
  @Get('conversations')
  async getConversations(@Req() req: any) {
    const userId = req.user.id;
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
    const userId = req.user.id;
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
    const userId = req.user.id;
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
    @Body() body: { content: string; messageType?: 'text' | 'image' | 'system'; attachmentUrl?: string; attachmentName?: string; attachmentSize?: number },
  ) {
    const userId = req.user.id;
    const message = await this.chatService.sendMessage(
      conversationId,
      userId,
      body.content,
      body.messageType || 'text',
      body.attachmentUrl,
      body.attachmentName,
      body.attachmentSize,
    );
    return { success: true, data: message };
  }

  /**
   * PATCH /chat/conversations/:id/read
   * Mark all messages in a conversation as read.
   */
  @Patch('conversations/:id/read')
  async markAsRead(@Req() req: any, @Param('id') conversationId: string) {
    const userId = req.user.id;
    const count = await this.chatService.markAsRead(conversationId, userId);
    return { success: true, data: { markedRead: count } };
  }

  /**
   * GET /chat/unread-count
   * Get total unread message count across all conversations.
   */
  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const userId = req.user.id;
    const count = await this.chatService.getTotalUnreadCount(userId);
    return { success: true, data: { unreadCount: count } };
  }

  /**
   * POST /chat/block
   * Block a user from messaging you.
   */
  @Post('block')
  async blockUser(@Req() req: any, @Body() body: { userId: string }) {
    const userId = req.user.id;
    await this.chatService.blockUser(userId, body.userId);
    return { success: true, data: { blocked: true } };
  }

  /**
   * DELETE /chat/block/:userId
   * Unblock a user.
   */
  @Delete('block/:userId')
  async unblockUser(@Req() req: any, @Param('userId') blockedId: string) {
    const userId = req.user.id;
    await this.chatService.unblockUser(userId, blockedId);
    return { success: true, data: { unblocked: true } };
  }

  /**
   * GET /chat/blocked
   * Get list of blocked user IDs.
   */
  @Get('blocked')
  async getBlockedUsers(@Req() req: any) {
    const userId = req.user.id;
    const blocked = await this.chatService.getBlockedUsers(userId);
    return { success: true, data: blocked };
  }

  /**
   * POST /chat/report
   * Report a user.
   */
  @Post('report')
  async reportUser(
    @Req() req: any,
    @Body() body: { userId: string; reason: string; details?: string; conversationId?: string },
  ) {
    const reporterId = req.user.id;
    await this.chatService.reportUser(
      reporterId, body.userId, body.reason, body.details, body.conversationId,
    );
    return { success: true, data: { reported: true } };
  }

  /**
   * DELETE /chat/conversations/:id
   * Delete a conversation and all its messages.
   */
  @Delete('conversations/:id')
  async deleteConversation(@Req() req: any, @Param('id') conversationId: string) {
    const userId = req.user.id;
    await this.chatService.deleteConversation(conversationId, userId);
    return { success: true, data: { deleted: true } };
  }
}
