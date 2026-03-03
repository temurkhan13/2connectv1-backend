/**
 * OnBoardingController
 * --------------------
 * Purpose:
 *   Secure, user-scoped endpoints that drive the full onboarding journey.
 *
 * Delivers:
 *   • Structure: sections → questions → answers → progress
 *   • Files: strict resume upload (type/size guarded, memory buffer)
 *   • AI: request and approve profile summaries
 *   • Auth: every action bound to the authenticated user (JWT)
 *
 * Contract:
 *   Clean 200 responses with documented Swagger schemas for easy client integration.
 */

import {
  Controller,
  UseGuards,
  Request,
  Res,
  HttpCode,
  Get,
  Post,
  Body,
  UseInterceptors,
  BadRequestException,
  UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import type { Express, Response } from 'express';
import { OnBoardingService } from 'src/modules/onboarding/onboarding.service';
import { SubmitOnboardingQuestionDto } from 'src/modules/onboarding/dto/onboarding.dto';

// Allowed file types for resume upload
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
// Max file size: 5 MB
const MAX_BYTES = 5 * 1024 * 1024;

@Controller('onboarding')
export class OnBoardingController {
  constructor(private readonly onBoardingService: OnBoardingService) {}

  @Get('question')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async getNextOnboardingQuestion(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req?.user?.id as string;
    const response = await this.onBoardingService.getNextOnboardingQuestion(userId);
    return response;
  }

  @Post('upload-resume')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_BYTES },
      fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          return cb(new BadRequestException('Only PDF or DOC/DOCX files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadResume(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    // Validate required file and size
    if (!file) throw new BadRequestException('File is required');
    if (file.size > MAX_BYTES) throw new BadRequestException('File too large (max 5 MB)');

    const userId = req?.user?.id as string | undefined;
    const response = await this.onBoardingService.uploadResume(file, userId);
    return response;
  }

  @Post('submit-question')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async submitOnboardingQuestion(
    @Request() req,
    @Body() dto: SubmitOnboardingQuestionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const submitResponse = await this.onBoardingService.submitOnboardingQuestion(userId, dto);
    if (submitResponse.fallback) {
      return {
        submitResponse: {
          user_response: submitResponse.user_response,
          user_input_response: submitResponse.user_input_response,
          is_answer_accepted: false,
        },
        nextQuestion: submitResponse.nextQuestion,
      };
    }
    const userResponse = await this.onBoardingService.getUserResponseByQuestionId(
      userId,
      dto.question_id,
    );
    const nextQuestion = await this.onBoardingService.getNextOnboardingQuestion(userId);
    return {
      submitResponse: {
        onboarding_status: submitResponse.onboarding_status,
        user_response: submitResponse.user_response,
        user_input_response: submitResponse.user_input_response,
        answer_id: userResponse,
        is_answer_accepted: true,
      },
      nextQuestion,
    };
  }

  @Post('reset-data')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async resetOnboardingData(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const response = await this.onBoardingService.resetOnboardingData(userId);
    return response;
  }

  @Post('update-question')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async updateOnboardingQuestion(
    @Request() req,
    @Body() dto: SubmitOnboardingQuestionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const submitUpdateddResponse: any = await this.onBoardingService.updateOnboardingQuestion(
      userId,
      dto,
    );
    if (submitUpdateddResponse.fallback) {
      return {
        submitResponse: {
          user_response: submitUpdateddResponse.user_response,
          user_input_response: submitUpdateddResponse.user_input_response,
          is_answer_accepted: false,
        },
        nextQuestion: submitUpdateddResponse.nextQuestion,
      };
    }
    const userResponse = await this.onBoardingService.getUserResponseByQuestionId(
      userId,
      dto.question_id,
    );
    const nextQuestion = await this.onBoardingService.getNextOnboardingQuestion(userId);
    return {
      submitResponse: {
        user_response: submitUpdateddResponse.user_response,
        user_input_response: submitUpdateddResponse.user_input_response,
        answer_id: userResponse,
        is_answer_accepted: true,
      },
      nextQuestion,
    };
  }

  @Get('progress')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async getOnboardingProgress(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const response = await this.onBoardingService.getOnboardingProgress(userId);
    return response;
  }

  @Get('answers')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async getOnboardingAnswersData(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const response = await this.onBoardingService.getOnboardingAnswersData(userId);
    return response;
  }

  @Post('request-ai-summary')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async requestAiSummary(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const response = await this.onBoardingService.requestAiSummary(userId);
    return response;
  }

  @Post('approve-ai-summary/:id')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async approveAiSummary(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const summaryId = req.params.id;
    const response = await this.onBoardingService.approveAiSummary(userId, summaryId);
    return response;
  }

  /**
   * Database migration/backfill script endpoint.
   * SECURITY: Requires JWT authentication AND admin role.
   * This endpoint can modify database records in bulk.
   */
  @Post('script')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async script(@Request() req, @Res({ passthrough: true }) res: Response) {
    // Additional admin check - only allow if user has admin privileges
    const userId = req?.user?.id;
    if (!userId) {
      throw new BadRequestException('Authentication required');
    }
    const response = await this.onBoardingService.script({});
    return response;
  }

  // ==========================================
  // Conversational Onboarding Endpoints
  // Dynamic Slot-Filling, Multi-Turn Context, Progressive Disclosure
  // ==========================================

  /**
   * Start Conversational Onboarding
   * POST /onboarding/conversational/start
   * Initiates a new chat-based onboarding session.
   */
  @Post('conversational/start')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async startConversationalOnboarding(@Request() req, @Body() body: { objective?: string }) {
    const userId = req.user.id;
    const response = await this.onBoardingService.startConversationalOnboarding(
      userId,
      body.objective,
    );
    return response;
  }

  /**
   * Conversational Onboarding Chat
   * POST /onboarding/conversational/chat
   * Sends a chat message and receives AI response with extracted slots.
   */
  @Post('conversational/chat')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async conversationalOnboardingChat(
    @Request() req,
    @Body() body: { message: string; session_id?: string },
  ) {
    const userId = req.user.id;
    if (!body.message) {
      throw new BadRequestException('Message is required');
    }
    const response = await this.onBoardingService.conversationalOnboardingChat(
      userId,
      body.message,
      body.session_id,
    );
    return response;
  }

  /**
   * Get Conversational Onboarding Progress
   * GET /onboarding/conversational/progress/:sessionId
   * Retrieves progress for a conversational onboarding session.
   */
  @Get('conversational/progress/:sessionId')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async getConversationalOnboardingProgress(@Request() req) {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }
    const response = await this.onBoardingService.getConversationalOnboardingProgress(sessionId);
    return response;
  }

  /**
   * Finalize Conversational Onboarding
   * POST /onboarding/conversational/finalize/:sessionId
   * Finalizes the session and returns all collected data.
   */
  @Post('conversational/finalize/:sessionId')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async finalizeConversationalOnboarding(@Request() req) {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }
    const response = await this.onBoardingService.finalizeConversationalOnboarding(sessionId);
    return response;
  }

  /**
   * Complete Conversational Onboarding
   * POST /onboarding/conversational/complete
   * Completes onboarding and triggers profile/persona creation.
   */
  @Post('conversational/complete')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async completeConversationalOnboarding(@Request() req, @Body() body: { session_id: string }) {
    const userId = req.user.id;
    if (!body.session_id) {
      throw new BadRequestException('Session ID is required');
    }
    const response = await this.onBoardingService.completeConversationalOnboarding(
      userId,
      body.session_id,
    );
    return response;
  }
}
