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
import {
  verifySnsSignature,
  confirmSnsSubscription,
} from 'src/modules/webhooks/sns-signature.util';
import type { SnsMessage } from 'src/modules/webhooks/sns-signature.util';
import { Logger } from '@nestjs/common';

const SES_SNS_TOPIC_ARNS = new Set<string>([
  'arn:aws:sns:us-west-2:007159205256:2connect-ses-bounces',
  'arn:aws:sns:us-west-2:007159205256:2connect-ses-complaints',
  'arn:aws:sns:us-west-2:007159205256:2connect-ses-deliveries',
]);

@Controller('webhooks')
export class WebhooksController {
  private readonly sesLogger = new Logger('SesEventsWebhook');

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

  /**
   * DELETE /webhooks/clear-matches
   * Summary:
   * - Deletes all matches from the database.
   * - Used when resyncing matches from AI service.
   * Steps:
   * - Check x-api-key → verify against env.
   * - Call service.clearAllMatches → return result.
   */
  @Post('clear-matches')
  @HttpCode(200)
  async clearMatchesWebhook(@Request() _req: any, @Headers('x-api-key') apiKey?: string) {
    // 0) simple shared-secret check (public endpoint hardening)
    if (!apiKey || apiKey !== this.configService.get('AI_SERVICE_WEBHOOK_API_KEY', '')) {
      throw new UnauthorizedException('Invalid API key');
    }

    // 1) forward to service
    const response = await this.webhooksService.clearAllMatches();

    // 2) return result
    return response;
  }

  /**
   * POST /webhooks/verify-users
   * Summary:
   * - Marks users as email verified by email addresses.
   * - Temporary endpoint for testing/admin purposes.
   * Steps:
   * - Check x-api-key → verify against env.
   * - Call service.verifyUsersByEmail → return result.
   */
  @Post('verify-users')
  @HttpCode(200)
  async verifyUsersWebhook(
    @Request() _req: any,
    @Body() body: { emails: string[] },
    @Headers('x-api-key') apiKey?: string,
  ) {
    // 0) simple shared-secret check
    if (!apiKey || apiKey !== this.configService.get('AI_SERVICE_WEBHOOK_API_KEY', '')) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (!body.emails || !Array.isArray(body.emails)) {
      throw new BadRequestException('emails array is required');
    }

    // 1) forward to service
    const response = await this.webhooksService.verifyUsersByEmail(body.emails);

    // 2) return result
    return response;
  }

  /**
   * POST /webhooks/ses-events
   * Summary:
   * - Receives SNS notifications for SES bounce / complaint / delivery events.
   * - No API key — SNS cannot add arbitrary auth headers. Instead we:
   *   (a) verify the SNS RSA signature against the cert at SigningCertURL
   *   (b) require the TopicArn to be one of our known SES topics
   *   (c) auto-confirm SubscriptionConfirmation messages
   * - Always responds 200 (even on malformed payloads) so SNS doesn't
   *   retry-storm us; logs + increments a counter for bad payloads instead.
   */
  @Post('ses-events')
  @HttpCode(200)
  async sesEventsWebhook(@Body() body: SnsMessage) {
    try {
      if (!body || typeof body !== 'object' || !body.Type) {
        this.sesLogger.warn('malformed SNS payload (missing Type)');
        return { status: 'ignored', reason: 'malformed' };
      }

      if (!SES_SNS_TOPIC_ARNS.has(body.TopicArn)) {
        this.sesLogger.warn(`unknown TopicArn: ${body.TopicArn}`);
        return { status: 'ignored', reason: 'unknown_topic' };
      }

      const signatureOk = await verifySnsSignature(body);
      if (!signatureOk) {
        this.sesLogger.warn(`SNS signature verification failed (MessageId=${body.MessageId})`);
        return { status: 'ignored', reason: 'bad_signature' };
      }

      if (body.Type === 'SubscriptionConfirmation') {
        if (!body.SubscribeURL) {
          this.sesLogger.warn('SubscriptionConfirmation without SubscribeURL');
          return { status: 'ignored', reason: 'no_subscribe_url' };
        }
        const ok = await confirmSnsSubscription(body.SubscribeURL);
        this.sesLogger.log(
          `SubscriptionConfirmation auto-confirmed topic=${body.TopicArn} ok=${ok}`,
        );
        return { status: 'subscription_confirmed', ok };
      }

      if (body.Type === 'UnsubscribeConfirmation') {
        this.sesLogger.log(`UnsubscribeConfirmation topic=${body.TopicArn}`);
        return { status: 'unsubscribe_logged' };
      }

      if (body.Type === 'Notification') {
        let event: any;
        try {
          event = JSON.parse(body.Message);
        } catch (err) {
          this.sesLogger.warn(
            `SNS Notification with non-JSON Message (MessageId=${body.MessageId})`,
          );
          return { status: 'ignored', reason: 'non_json_message' };
        }
        const result = await this.webhooksService.handleSesEvent(event);
        return result;
      }

      return { status: 'ignored', reason: `unknown_type:${body.Type}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sesLogger.error(`sesEventsWebhook error: ${msg}`);
      return { status: 'error', error: msg };
    }
  }
}
