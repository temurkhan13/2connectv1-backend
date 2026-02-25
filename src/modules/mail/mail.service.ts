import * as nodemailer from 'nodemailer';
import { Injectable, Logger } from '@nestjs/common';
import { SESv2Client, SendEmailCommand, SESv2ClientConfig } from '@aws-sdk/client-sesv2';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Op, fn, col, WhereOptions } from 'sequelize';
import { Match } from 'src/common/entities/match.entity';
import { User } from 'src/common/entities/user.entity';
import { OnboardingStatusEnum } from 'src/common/enums';
import { VerifyEmailTemplate } from 'src/common/email-templates/email_verificartion_template';
import { forgotPasswordTemplate } from 'src/common/email-templates/forgot_password_template';
import { newApprovalTemplate } from 'src/common/email-templates/new_approval_template';
import { newMatchTemplate } from 'src/common/email-templates/new_match_template';
import { newMessageTemplate } from 'src/common/email-templates/new_message_template';

export type WeeklyMatchEmailJobPayload = {
  email: string;
  firstName: string;
  count: number;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly ses: SESv2Client;
  private readonly fromEmail: string;
  private readonly appName: string;
  // private gmailTransporter?: nodemailer.Transporter;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Match) private readonly matchModel: typeof Match,
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectQueue('weekly-match-email')
    private readonly weeklyMatchEmailQueue: Queue<WeeklyMatchEmailJobPayload>,
  ) {
    const region = this.config.get<string>('AWS_REGION') || 'ap-south-1';
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const clientConfig: SESv2ClientConfig = { region };

    // If running locally with explicit credentials
    if (accessKeyId) {
      const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY')!;
      clientConfig.credentials = { accessKeyId, secretAccessKey };
      this.logger.log('SES: Using explicit credentials from environment (local dev).');
    } else {
      this.logger.log('SES: Using default credential provider chain (IAM role on EC2/ECS).');
    }

    this.ses = new SESv2Client(clientConfig);

    this.fromEmail = this.config.get<string>('SES_FROM_EMAIL', 'no-reply@example.com');
    this.appName = this.config.get<string>('APP_NAME', 'App');
  }

  // ---------------------------------------------------------------------------
  // Small helpers to inject values into HTML templates
  // ---------------------------------------------------------------------------

  private injectS3Url(template: string): string {
    if (!template) return '';
    const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || '';
    return template.replace(/{{\s*s3_public_url\s*}}/gi, S3_PUBLIC_URL);
  }

  private injectSOcialMediaAndOfficialUrls(template: string): string {
    if (!template) return '';
    const INSTAGRAM_URL = process.env.INSTAGRAM_URL || '';
    const TWITTER_URL = process.env.TWITTER_URL || '';
    const FACEBOOK_URL = process.env.FACEBOOK_URL || '';
    const TERMS_AND_CONDITIONS_URL = process.env.TERMS_AND_CONDITIONS_URL || '';
    const PRIVACY_POLICY_URL = process.env.PRIVACY_POLICY_URL || '';
    let html = template.replace(/{{\s*instagram_url\s*}}/gi, INSTAGRAM_URL);
    html = html.replace(/{{\s*twitter_url\s*}}/gi, TWITTER_URL);
    html = html.replace(/{{\s*facebook_url\s*}}/gi, FACEBOOK_URL);
    html = html.replace(/{{\s*terms_url\s*}}/gi, TERMS_AND_CONDITIONS_URL);
    html = html.replace(/{{\s*privacy_url\s*}}/gi, PRIVACY_POLICY_URL);
    return html;
  }

  /** Replace {{code}} (any case) with provided code */
  private injectCode(template: string, code: string): string {
    if (!template) return '';
    return template.replace(/{{\s*code\s*}}/gi, code);
  }

  /** Replace {{approver}} (any case) with provided name */
  private injectApproverName(template: string, name: string): string {
    if (!template) return '';
    return template.replace(/{{\s*approver\s*}}/gi, name);
  }

  /** Replace {{name}} (any case) with provided name */
  private injectName(template: string, name: string): string {
    if (!template) return '';
    return template.replace(/{{\s*name\s*}}/gi, name);
  }

  /** Replace {{sender}} (any case) with provided name */
  private injectSender(template: string, name: string): string {
    if (!template) return '';
    return template.replace(/{{\s*sender\s*}}/gi, name);
  }

  /** Replace {{frontend_url}} (any case) with FRONT_END_BASE_URL */
  private injectUrl(template: string): string {
    if (!template) return '';
    const frontendUrl = process.env.FRONT_END_BASE_URL || '';
    return template.replace(/{{\s*frontend_url\s*}}/gi, frontendUrl);
  }

  // ---------------------------------------------------------------------------
  // SINGLE EMAIL SENDER FUNCTION
  // ---------------------------------------------------------------------------
  /**
   * sendEmail
   * ---------
   * Central place where the actual email send happens.
   * Today: uses Gmail + Nodemailer.
   */

  // private async sendEmail(params: {
  //   to: string;
  //   subject: string;
  //   html: string;
  //   textFallback?: string;
  //   logContext?: string; // optional tag for logs (e.g. 'verify-email')
  // }): Promise<boolean> {
  //   this.logger.log(`??? SEND MAIL ???`);
  //   const { to, subject, html, textFallback, logContext } = params;

  //   // 1) Make sure transporter exists (lazy init, reused for all emails)
  //   if (!this.gmailTransporter) {
  //     const user = this.config.get<string>('GMAIL_USER');
  //     const pass = this.config.get<string>('GMAIL_APP_PASSWORD');

  //     if (!user || !pass) {
  //       this.logger.error(
  //         'Gmail creds missing. Set GMAIL_USER and GMAIL_APP_PASSWORD before sending emails.',
  //       );
  //       return false;
  //     }

  //     this.gmailTransporter = nodemailer.createTransport({
  //       service: 'gmail',
  //       auth: { user, pass }, // Google App Password (NOT normal password)
  //     });
  //   }

  //   const fromAddress =
  //     this.config.get<string>('GMAIL_FROM') || this.config.get<string>('GMAIL_USER')!;
  //   this.logger.log({ from_address: fromAddress });
  //   // 2) Decide text version (fallback)
  //   const text =
  //     textFallback ||
  //     stripHtml(html) ||
  //     `${this.appName} notification. If you cannot view HTML, please open the app.`;

  //   // 3) Send email (single place)
  //   try {
  //     const info = await this.gmailTransporter.sendMail({
  //       from: fromAddress,
  //       to,
  //       subject,
  //       html,
  //       text,
  //     });

  //     const tag = logContext ? `[${logContext}] ` : '';
  //     this.logger.log(`${tag}Email sent: ${info.messageId} to ${to}`);
  //     return true;
  //   } catch (err) {
  //     const tag = logContext ? `[${logContext}] ` : '';
  //     this.logger.error(`${tag}Email send failed`, err as Error);
  //     return false;
  //   }
  // }

  // ---------------------------------------------------------------------------
  // PUBLIC API: each method only builds template + subject, then calls sendEmail
  // ---------------------------------------------------------------------------

  private async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    textFallback?: string;
    logContext?: string;
  }): Promise<boolean> {
    const { to, subject, html, textFallback, logContext } = params;
    const tag = logContext ? `[${logContext}] ` : '';

    this.logger.log(`${tag}Preparing to send email via SES to: ${to}`);

    // 1) Build text fallback
    const text =
      textFallback ||
      stripHtml(html) ||
      `${this.appName} notification. If you cannot view HTML, please open the app.`;

    // 2) Prepare SES request
    const payload = {
      FromEmailAddress: this.fromEmail,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
        },
      },
    };

    const cmd = new SendEmailCommand(payload);

    try {
      const res = await this.ses.send(cmd);

      if (!res.MessageId) {
        this.logger.error(`${tag}SES returned no MessageId — email may NOT have been sent.`);
        return false;
      }

      this.logger.log(`${tag}Email successfully handed to SES for delivery.`);
      return true;
    } catch (err) {
      const error = err as Error;

      this.logger.error(`${tag}SES email send FAILED: ${error.message}`);

      return false;
    }
  }

  /**
   * Send account verification email.
   */
  async sendAccountVerificationEmail(email: string, code: string): Promise<boolean> {
    this.logger.log(`SEND ACCOUNT VERIFICATION EMAIL`);
    this.logger.log({ email });
    this.logger.log({ code });
    let html = this.injectCode(VerifyEmailTemplate, code);
    html = this.injectS3Url(html);
    html = this.injectSOcialMediaAndOfficialUrls(html);
    const textFallback =
      stripHtml(html) ||
      `${this.appName} verification code: ${code}. If you cannot view HTML, use this code in the app.`;

    const subject = `${this.appName} — Verify your email`;

    return this.sendEmail({
      to: email,
      subject,
      html,
      textFallback,
      logContext: 'verify-email',
    });
  }

  /**
   * Send forgot-password email.
   */
  async sendForgotPasswordEmail(email: string, code: string): Promise<boolean> {
    this.logger.log(`SEND FORGOT PASSWORD EMAIL`);
    this.logger.log({ email });
    this.logger.log({ code });

    let html = this.injectCode(forgotPasswordTemplate, code);
    html = this.injectS3Url(html);
    html = this.injectSOcialMediaAndOfficialUrls(html);

    const textFallback =
      stripHtml(html) ||
      `${this.appName} password reset code: ${code}. If you cannot view HTML, use this code in the app.`;

    const subject = `${this.appName} — Reset your password`;

    return this.sendEmail({
      to: email,
      subject,
      html,
      textFallback,
      logContext: 'forgot-password',
    });
  }

  /**
   * Send "awaiting response/approval" email.
   */
  async sendAwaitingResponseEmail(
    email: string,
    name: string,
    approver_name: string,
  ): Promise<boolean> {
    this.logger.log(`SEND AWAITING RESPONSE EMAIL`);
    this.logger.log({ email });
    this.logger.log({ name });
    this.logger.log({ approver_name });

    let html = this.injectApproverName(newApprovalTemplate, approver_name);
    html = this.injectName(html, name);
    html = this.injectUrl(html);
    html = this.injectS3Url(html);
    html = this.injectSOcialMediaAndOfficialUrls(html);

    const textFallback =
      stripHtml(html) ||
      `${this.appName}: Hello ${name}, your request is awaiting your response/approval. Please open the app to continue.`;

    const subject = `${this.appName} — Awaiting your response`;

    return this.sendEmail({
      to: email,
      subject,
      html,
      textFallback,
      logContext: 'awaiting-response',
    });
  }

  /**
   * Send weekly match summary email:
   * "Hey {firstName}, you appeared in X matches this week"
   */
  async sendWeeklyMatchSummaryEmail(
    email: string,
    firstName: string,
    count: number,
  ): Promise<boolean> {
    this.logger.log(`SEND WEEKLY MATCH SUMMARY EMAIL`);
    this.logger.log({ email });
    this.logger.log({ first_name: firstName });
    this.logger.log({ count });
    const plural = count === 1 ? 'match' : 'matches';

    let html = this.buildWeeklyMatchSummaryHtml(firstName, count, plural);
    html = this.injectUrl(html);
    html = this.injectS3Url(html);
    html = this.injectSOcialMediaAndOfficialUrls(html);

    const textFallback =
      stripHtml(html) ||
      `Hey ${firstName || 'there'}, you appeared in ${count} ${plural} this week on ${
        this.appName
      }.`;

    const subject = `${this.appName} — Your weekly match summary`;

    return this.sendEmail({
      to: email,
      subject,
      html,
      textFallback,
      logContext: 'weekly-match-summary',
    });
  }

  /**
   * Helper for weekly match summary HTML.
   */
  private buildWeeklyMatchSummaryHtml(
    firstName: string,
    count: number,
    pluralLabel: string,
  ): string {
    const name = firstName || 'there';

    return newMatchTemplate
      .replace(/{{\s*name\s*}}/g, name)
      .replace(/{{\s*match_count\s*}}/g, String(count))
      .replace(/{{\s*match_label\s*}}/g, pluralLabel);
  }

  /**
   * Send "new message" notification email.
   */
  async sendNewMessageEmail(
    email: string,
    receiver_name: string,
    sender_name: string,
  ): Promise<boolean> {
    this.logger.log(`SEND NEW MESSAGE EMAIL`);
    this.logger.log({ email });
    this.logger.log({ sender_name });
    this.logger.log({ receiver_name });
    let html = (newMessageTemplate || '').replace(/{{\s*name\s*}}/gi, receiver_name || '');
    html = this.injectUrl(html);
    html = this.injectSender(html, sender_name);
    html = this.injectS3Url(html);
    html = this.injectSOcialMediaAndOfficialUrls(html);

    const textFallback =
      stripHtml(html) ||
      `Hi ${receiver_name || ''}, you have a new message on ${
        this.appName
      }. Please open the app to read it.`;

    const subject = `${this.appName} — You have a new message`;

    return this.sendEmail({
      to: email,
      subject,
      html,
      textFallback,
      logContext: 'new-message',
    });
  }

  /**
   * enqueueWeeklyMatchSummaryEmails
   * -------------------------------
   * Purpose:
   * - Find all eligible users who appeared in matches in last 7 days.
   * - For each user, enqueue a job in Redis (Bull queue).
   *
   */
  async enqueueWeeklyMatchSummaryEmails(EMAIL_JOB_EXECUTION_TIME_IN_DAYS: number): Promise<void> {
    this.logger.log('Starting match summary enqueue job');

    const now = new Date();
    const xDaysAgo = new Date(
      //now.getTime() - Number(EMAIL_JOB_EXECUTION_TIME_IN_DAYS) * 24 * 60 * 60 * 1000,
      now.getTime() - 60 * 60 * 1000,
    );

    const matchWhere: WhereOptions = {
      created_at: { [Op.gte]: xDaysAgo },
    };

    const userWhere: WhereOptions = {
      is_active: true,
      email_notifications: true,
      allow_matching: true,
      onboarding_status: OnboardingStatusEnum.COMPLETED,
    };

    // 1) Aggregate for user_a_id
    const resultsA = await this.matchModel.findAll({
      attributes: ['user_a_id', [fn('COUNT', col('Match.id')), 'match_count']],
      where: matchWhere,
      include: [
        {
          model: this.userModel,
          as: 'userA',
          attributes: ['id', 'email', 'first_name', 'last_name'],
          where: userWhere,
          required: true,
        },
      ],
      group: ['user_a_id', 'userA.id', 'userA.email', 'userA.first_name', 'userA.last_name'],
      raw: true,
    });
    this.logger.log({ result_a: resultsA.length });

    // 2) Aggregate for user_b_id
    const resultsB = await this.matchModel.findAll({
      attributes: ['user_b_id', [fn('COUNT', col('Match.id')), 'match_count']],
      where: matchWhere,
      include: [
        {
          model: this.userModel,
          as: 'userB',
          attributes: ['id', 'email', 'first_name', 'last_name'],
          where: userWhere,
          required: true,
        },
      ],
      group: ['user_b_id', 'userB.id', 'userB.email', 'userB.first_name', 'userB.last_name'],
      raw: true,
    });
    this.logger.log({ result_b: resultsB.length });

    type UserCount = {
      userId: string;
      email: string;
      firstName: string;
      lastName: string;
      count: number;
    };

    const userMap = new Map<string, UserCount>();
    this.logger.log({ initital_user_map: userMap.size });
    const upsertUserCount = (
      userId: string,
      email: string,
      firstName: string,
      lastName: string,
      delta: number,
    ) => {
      const existing = userMap.get(userId);
      if (existing) {
        existing.count += delta;
      } else {
        userMap.set(userId, {
          userId,
          email,
          firstName,
          lastName,
          count: delta,
        });
      }
    };
    this.logger.log({ upserting: true });

    for (const row of resultsA as any[]) {
      upsertUserCount(
        row.user_a_id,
        row['userA.email'],
        row['userA.first_name'],
        row['userA.last_name'],
        Number(row.match_count) || 0,
      );
    }
    this.logger.log({ upserting_result_a: true });
    this.logger.log({ user_map: userMap.size });

    for (const row of resultsB as any[]) {
      upsertUserCount(
        row.user_b_id,
        row['userB.email'],
        row['userB.first_name'],
        row['userB.last_name'],
        Number(row.match_count) || 0,
      );
    }
    this.logger.log({ upserting_result_b: true });
    this.logger.log({ user_map: userMap.size });

    // 2.5) Quick Redis connectivity check
    try {
      // Bull queue client (Promise<RedisClient>)
      this.logger.log(`in try block`);
      const redisClient = await this.weeklyMatchEmailQueue.client;
      this.logger.log(`redisclient initialized`);
      this.logger.log(`pinging redis`);
      const pong = await redisClient.ping();
      this.logger.log(`Redis PING response: ${pong}`); // expect 'PONG'
    } catch (err) {
      this.logger.error('Redis PING failed. Check Redis host/port/password / network.', err.stack);
    }
    this.logger.log(`outside try catch block`);

    this.logger.log({
      now: now.toISOString(),
      xDaysAgo: xDaysAgo.toISOString(),
      resultsA_len: (resultsA as any[]).length,
      resultsB_len: (resultsB as any[]).length,
      userMapSize: userMap.size,
    });

    if (userMap.size === 0) {
      this.logger.log('No eligible users with matches in last 7 days. Skipping enqueue.');
      return;
    }

    this.logger.log(`Enqueuing weekly match emails for ${userMap.size} users`);

    // 3) Enqueue a job per user
    for (const [, item] of userMap) {
      this.logger.log({
        email: item.email,
        firstName: item.firstName,
        count: item.count,
      });
      if (!item.count) continue;
      this.logger.log(`adding to queue`);
      const res = await this.weeklyMatchEmailQueue.add(
        'weekly_match_summary', // job name
        {
          email: item.email,
          firstName: item.firstName,
          count: item.count,
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.log({ response_from_queue: res.id || res });
    }

    this.logger.log('Weekly match summary enqueue job finished');
  }
}

/** Tiny helper to extract a text fallback from HTML */
function stripHtml(html: string): string {
  return html
    ?.replace(/<style[\s\S]*?<\/style>/gi, '')
    ?.replace(/<script[\s\S]*?<\/script>/gi, '')
    ?.replace(/<[^>]+>/g, ' ')
    ?.replace(/\s+/g, ' ')
    ?.trim();
}
