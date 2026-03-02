import { Controller, Post, Body, UseGuards, Request, HttpCode, Get, Query, Logger, ServiceUnavailableException } from '@nestjs/common';
import { StreamChat } from 'stream-chat';
import { ApiTags, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AiConversationsService } from 'src/modules/ai-conversations/ai-conversations.service';
import {
  InitiateAIChatDto,
  TriggerUserToUserDto,
  ListAIConversationsQueryDto,
  GetAIConversationDetailQueryDto,
  SubmitAiChatFeedbackDto,
} from 'src/modules/ai-conversations/dto/ai-conversation.dto';
import { RESPONSES } from 'src/common/responses';

// Check if Stream Chat is properly configured
const STREAM_API_KEY = process.env.STREAM_API_KEY;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET;
const isStreamConfigured = !!(STREAM_API_KEY && STREAM_API_SECRET && STREAM_API_KEY !== 'placeholder');

@ApiTags('AI-Conversations')
@Controller('ai-conversations')
export class AiConversationsController {
  private readonly logger = new Logger(AiConversationsController.name);
  private serverClient: StreamChat | null = null;

  constructor(private readonly aiConversationsService: AiConversationsService) {
    if (isStreamConfigured) {
      try {
        this.serverClient = StreamChat.getInstance(
          STREAM_API_KEY!,
          STREAM_API_SECRET!,
        );
        this.logger.log('Stream Chat client initialized successfully');
      } catch (error) {
        this.logger.error('Failed to initialize Stream Chat client:', error);
      }
    } else {
      this.logger.warn('Stream Chat not configured - STREAM_API_KEY or STREAM_API_SECRET missing');
    }
  }

  /**
   * initiateAIChat
   * --------------
   * Purpose:
   * - Starts an AI conversation for a given match.
   *
   * Request:
   * - Body: { match_id: UUID, responder_id: UUID, template?: string }
   *
   * Flow:
   * - Get caller from JWT (req.user.id).
   * - Pass user_id + payload to service.initiateAIChat().
   * - Service handles checks, creation, and returns the conversation.
   */
  @Post('initiate-ai-conversation')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiBody({ type: InitiateAIChatDto })
  @ApiResponse({
    status: 200,
    description: 'AI conversation started (or returned if already open).',
  })
  async initiateAIChat(@Request() req, @Body() body: InitiateAIChatDto) {
    const userId = req.user.id; // from JWT
    return this.aiConversationsService.initiateAIChat(userId, body);
  }

  /**
   * getAIConversations (paginated)
   * ------------------------------
   * Purpose:
   * - Returns AI conversations for the logged-in user (as A or B), newest first.
   *
   * Request:
   * - Query: { page?: number = 1, limit?: number = 20 }
   * - Session/JWT: req.user.id (same as other endpoints)
   *
   * Response (shape):
   * {
   *   data: [...],
   *   total: number,
   *   page: number,
   *   limit: number,
   *   totalPages: number
   * }
   */
  @Get('get-all-conversations')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Paginated AI conversations for the current user.',
    schema: {
      example: {
        data: [],
        total: 12,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
  })
  async getAIConversations(@Request() req, @Query() query: ListAIConversationsQueryDto) {
    const userId = req.user.id; // from session/JWT
    const { page = 1, limit = 20 } = query;
    return this.aiConversationsService.getAIConversations(userId, page, limit);
  }

  /**
   * getAIConversationDetail (paginated)
   * -----------------------------------
   * Purpose:
   * - Returns a single conversation's messages (paginated) for the logged-in user.
   * - Adds other person’s id & name for quick UI rendering.
   *
   * Request:
   * - Query: { conversation_id: UUID, page?: number = 1, limit?: number = 20 }
   * - Session/JWT: req.user.id
   *
   * Response:
   * {
   *   meta: { id, other_person_id, other_person_name },
   *   data: [{ id, sender_id, content, created_at }],
   *   total, page, limit, totalPages
   * }
   */
  @Get('get-conversation-detail')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Single conversation detail (messages, paginated).',
    schema: {
      example: {
        meta: {
          id: 'c7e1…',
          other_person_id: '91d6…',
          other_person_name: 'Khalil Ur Rehman',
        },
        data: [
          {
            id: 'm1',
            sender_id: '8d8b…',
            content: 'Hi! Great to connect.',
            created_at: '2025-11-04T10:15:00.000Z',
          },
        ],
        total: 12,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
  })
  async getAIConversationDetail(@Request() req, @Query() query: GetAIConversationDetailQueryDto) {
    const userId = req.user.id; // from session/JWT
    return this.aiConversationsService.getAIConversationDetail(
      userId,
      query.conversation_id,
      query.page ?? 1,
      query.limit ?? 50,
    );
  }

  /**
   * submitAiChatFeedback endpoint
   * -----------------------------
   * Purpose:
   * - Accepts feedback for a specific AI chat from the logged-in user.
   * - Verifies the user via JWT guard.
   * - Extracts `ai_chat_id` and `feedback` from the request body (DTO validated).
   * - Calls the service to decide whether the user is A or B and update the correct column.
   * Response:
   * - Returns the updated ai_conversation record (or shaped object).
   */
  @Post('submit-ai-chat-feedback')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.onboardingMatchesSuccess.code,
    description: RESPONSES.onboardingMatchesSuccess.message,
    example: RESPONSES.onboardingMatchesSuccess,
  })
  async submitAiChatFeedback(@Request() req, @Body() body: SubmitAiChatFeedbackDto) {
    const userId = req.user.id;
    const ai_chat_id = body.ai_chat_id;
    const feedback = body.feedback;

    const response = await this.aiConversationsService.submitAiChatFeedback(
      userId,
      ai_chat_id,
      feedback,
    );
    return response;
  }

  /**
   * triggerUserToUserConversation
   * ------------------------------
   * Minimal endpoint to request the external user-to-user API for a given match.
   * Body: { match_id: string , responder_id: string }
   */
  @Post('initiate-user-to-user-conversation')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiBody({ type: TriggerUserToUserDto })
  @ApiResponse({ status: 200, description: 'Triggered user-to-user conversation request.' })
  async triggerUserToUser(@Request() req, @Body() body: TriggerUserToUserDto) {
    const initiatorId = req.user.id; // caller from JWT
    const result = await this.aiConversationsService.triggerUserToUser(initiatorId, body);
    return result;
  }

  @Get('token')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async getToken(@Request() req) {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Check if Stream Chat is configured
    if (!this.serverClient) {
      this.logger.warn(`Stream Chat token requested but not configured. User: ${userId}`);
      throw new ServiceUnavailableException(
        'Chat service is not configured. Please contact support.',
      );
    }

    try {
      // Register/update user in Stream Chat before generating token
      // This ensures the user exists in Stream for channel operations
      await this.serverClient.upsertUser({
        id: userId,
        name: userEmail?.split('@')[0] || userId.substring(0, 8),
        email: userEmail || undefined,
      });
      this.logger.debug(`Stream Chat user upserted: ${userId}`);

      // Always generate proper token - Stream doesn't allow dev tokens
      const token = this.serverClient.createToken(userId);
      this.logger.debug(`Stream Chat token generated for user: ${userId}`);
      return { token };
    } catch (error) {
      this.logger.error(`Failed to generate Stream Chat token for user ${userId}:`, error);
      throw new ServiceUnavailableException(
        'Failed to generate chat token. Please try again later.',
      );
    }
  }

  /**
   * Register a user with Stream Chat
   * Called when creating channels with users who may not have requested a token yet
   */
  @Post('register-user')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'User registered with Stream Chat.' })
  async registerStreamUser(@Request() req, @Body() body: { target_user_id: string; name?: string; email?: string }) {
    if (!this.serverClient) {
      this.logger.warn(`Stream Chat user registration requested but not configured.`);
      throw new ServiceUnavailableException(
        'Chat service is not configured. Please contact support.',
      );
    }

    try {
      const { target_user_id, name, email } = body;
      await this.serverClient.upsertUser({
        id: target_user_id,
        name: name || target_user_id.substring(0, 8),
        email: email || undefined,
      });
      this.logger.debug(`Stream Chat user registered: ${target_user_id}`);
      return { success: true, user_id: target_user_id };
    } catch (error) {
      this.logger.error(`Failed to register Stream Chat user:`, error);
      throw new ServiceUnavailableException(
        'Failed to register user with chat service.',
      );
    }
  }
}
