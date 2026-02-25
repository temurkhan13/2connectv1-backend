/**
 * WebhooksController
 * -------------------------------------------------------------
 * Purpose:
 * - Receive incoming webhooks from external AI/matching services.
 *
 * Summary:
 * - Exposes two POST endpoints:
 *   1) /webhooks/summary-ready         → handles AI summary-ready events
 *   2) /webhooks/user-matches-ready    → handles matches batch events
 * - Delegates processing to WebhooksService.
 */

import {
  Controller,
  Request,
  HttpCode,
  Post,
  Get,
  Body,
  Query,
  Headers,
  Res,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { WebhooksService } from 'src/modules/webhooks/webhooks.service';
import {
  UserMatchesReadyWebhookDto,
  MatchesReadyWebhookDto,
  SummaryReadyDto,
  AiChatReadyDto,
} from 'src/modules/webhooks/dto/webhooks.dto';
import { S3Service } from 'src/common/utils/s3.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly configService: ConfigService,
    private readonly webhooksService: WebhooksService,
    private readonly s3: S3Service,
  ) {}

  /**
   * POST /webhooks/summary-ready
   * Summary:
   * - Accepts AI summary-ready payload and forwards to service.
   * Steps:
   * - Read body → call service.summaryReadyWebhook → return result.
   */
  @Post('summary-ready')
  @HttpCode(200)
  async summaryReadyWebhook(
    @Request() _req: any,
    @Body() body: SummaryReadyDto,
    @Headers('x-api-key') apiKey?: string,
  ) {
    if (!apiKey || apiKey !== this.configService.get('AI_SERVICE_WEBHOOK_API_KEY', '')) {
      throw new UnauthorizedException('Invalid API key');
    }

    const response = await this.webhooksService.summaryReadyWebhook(body);
    return response;
  }

  /**
   * POST /webhooks/user-matches-ready
   * Summary:
   * - Accepts user-matches batch payload and forwards to service.
   * Steps:
   * - Read body → call service.userMatchesReadyWebhook → return result.
   */
  @Post('user-matches-ready')
  @HttpCode(200)
  async userMatchesReadyWebhook(
    @Request() _req: any,
    @Body() body: UserMatchesReadyWebhookDto,
    @Headers('x-api-key') apiKey?: string,
  ) {
    if (!apiKey || apiKey !== this.configService.get('AI_SERVICE_WEBHOOK_API_KEY', '')) {
      throw new UnauthorizedException('Invalid API key');
    }

    const response = await this.webhooksService.userMatchesReadyWebhook(body);
    return response;
  }

  /**
   * POST /webhooks/user-matches-ready
   * Summary:
   * - Accepts user-matches batch payload and forwards to service.
   * Steps:
   * - Read body → call service.userMatchesReadyWebhook → return result.
   */
  @Post('matches-ready')
  @HttpCode(200)
  async matchesReadyWebhook(
    @Request() _req: any,
    @Body() body: MatchesReadyWebhookDto,
    @Headers('x-api-key') apiKey?: string,
  ) {
    if (!apiKey || apiKey !== this.configService.get('AI_SERVICE_WEBHOOK_API_KEY', '')) {
      throw new UnauthorizedException('Invalid API key');
    }

    const response = await this.webhooksService.matchesReadyWebhook(body);
    return response;
  }

  /**
   * POST /webhooks/ai-chat-ready
   * Summary:
   * - Accepts AI-to-AI chat payload and forwards to service.
   * Steps:
   * - Check x-api-key → verify against env.
   * - Read body → call service.aiChatReadyWebhook → return result.
   */
  @Post('ai-chat-ready')
  @HttpCode(200)
  async aiChatReadyWebhook(
    @Request() _req: any,
    @Body() body: AiChatReadyDto,
    @Headers('x-api-key') apiKey?: string,
  ) {
    // 0) simple shared-secret check (public endpoint hardening)
    if (!apiKey || apiKey !== this.configService.get('AI_SERVICE_WEBHOOK_API_KEY', '')) {
      throw new UnauthorizedException('Invalid API key');
    }

    // 1) forward to service (service already validates content and runs tx)
    const response = await this.webhooksService.aiChatReadyWebhook(body);

    // 2) return unified shape
    return response;
  }

  /**
   * GET /webhooks/fetch-data
   * Summary:
   * - Accepts a URL in query params and forwards it to the service for processing.
   * Steps:
   * - Check x-api-key → verify against env (shared secret check).
   * - Read `url` query param → validate presence.
   * - Call s3 function to stream the file based on url
   */
  @Get('stream-file')
  @HttpCode(200)
  async fetchDataWebhook(
    @Query('url') url: string,
    @Res() res: Response,
    @Headers('x-api-key') apiKey?: string,
  ) {
    // 0) simple shared-secret check (public endpoint hardening)
    if (!apiKey || apiKey !== this.configService.get('AI_SERVICE_WEBHOOK_API_KEY', '')) {
      throw new UnauthorizedException('Invalid API key');
    }

    // 1) validate input
    if (!url) {
      throw new BadRequestException('Missing required query param: url');
    }

    await this.s3.streamToResponseByUrl(res, url, { inline: true });
  }

  @Get('list-users')
  @HttpCode(200)
  async listUsersWebhook(@Request() _req: any, @Headers('x-api-key') apiKey?: string) {
    // 0) simple shared-secret check (public endpoint hardening)
    if (!apiKey || apiKey !== this.configService.get('AI_SERVICE_WEBHOOK_API_KEY', '')) {
      throw new UnauthorizedException('Invalid API key');
    }

    // 1) forward to service (service already validates content and runs tx)
    const response = await this.webhooksService.listUsersWebhook();

    // 2) return unified shape
    return response;
  }

  @Get('get-user-data')
  @HttpCode(200)
  async getUserDataWebhook(
    @Request() _req: any,
    @Query('user_id') user_id: string,
    @Headers('x-api-key') apiKey?: string,
  ) {
    // 0) simple shared-secret check (public endpoint hardening)
    if (!apiKey || apiKey !== this.configService.get('AI_SERVICE_WEBHOOK_API_KEY', '')) {
      throw new UnauthorizedException('Invalid API key');
    }
    // 1) forward to service (service already validates content and runs tx)
    const response = await this.webhooksService.getUserDataWebhook(user_id);

    // 2) return unified shape
    return response;
  }
}
