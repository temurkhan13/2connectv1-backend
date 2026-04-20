import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
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
import { EmailSent } from 'src/common/entities/email-sent.entity';

export type WeeklyMatchEmailJobPayload = {
  email: string;
  firstName: string;
  count: number;
  // Optional tier breakdown — populated by the aggregation once the AI
  // matching pipeline sets `matches.reciprocal` (added Apr-17). Legacy
  // queue entries without these fields render as a flat count.
  primaryCount?: number;
  adjacentCount?: number;
  // userId is used to generate a signed unsubscribe token per-user.
  // Optional for backward-compat with pre-Apr-18 in-flight queue items;
  // when absent the digest sends without a List-Unsubscribe header.
  userId?: string;
};

/**
 * Sign a userId into an unsubscribe token: base64url(payload).base64url(HMAC-SHA256(payload)).
 * Payload is a compact JSON { u: userId, t: 'unsub' }. No expiry — users should
 * always be able to act on an unsubscribe link even from old emails.
 * Verification happens in AuthController.unsubscribe().
 */
export function signUnsubscribeToken(userId: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, t: 'unsub' })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  // Constant-time compare to avoid signature-timing leaks.
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data?.t !== 'unsub' || typeof data?.u !== 'string') return null;
    return data.u;
  } catch {
    return null;
  }
}

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
    @InjectModel(EmailSent) private readonly emailSentModel: typeof EmailSent,
    @InjectQueue('weekly-match-email')
    private readonly weeklyMatchEmailQueue: Queue<WeeklyMatchEmailJobPayload>,
  ) {
    // SES-specific credential override.
    // The backend's primary AWS_ACCESS_KEY_ID may belong to a different account
    // than the one where SES identities / production access live. Prefer
    // SES_AWS_* if set; fall back to generic AWS_* otherwise.
    const sesRegion =
      this.config.get<string>('SES_AWS_REGION') ||
      this.config.get<string>('AWS_REGION') ||
      'us-west-2';
    const sesAccessKeyId =
      this.config.get<string>('SES_AWS_ACCESS_KEY_ID') ||
      this.config.get<string>('AWS_ACCESS_KEY_ID');
    const clientConfig: SESv2ClientConfig = { region: sesRegion };

    if (sesAccessKeyId) {
      const sesSecretAccessKey =
        this.config.get<string>('SES_AWS_SECRET_ACCESS_KEY') ||
        this.config.get<string>('AWS_SECRET_ACCESS_KEY')!;
      clientConfig.credentials = {
        accessKeyId: sesAccessKeyId,
        secretAccessKey: sesSecretAccessKey,
      };
      this.logger.log(`SES: Using explicit credentials (region=${sesRegion}).`);
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
    // Instagram is intentionally left for backward-compat with any legacy
    // template row that still references it; current templates use the
    // 2Connect social set: LinkedIn + X + Facebook + YouTube.
    const INSTAGRAM_URL = process.env.INSTAGRAM_URL || '';
    const TWITTER_URL = process.env.TWITTER_URL || '';
    const FACEBOOK_URL = process.env.FACEBOOK_URL || '';
    const LINKEDIN_URL = process.env.LINKEDIN_URL || '';
    const YOUTUBE_URL = process.env.YOUTUBE_URL || '';
    const TERMS_AND_CONDITIONS_URL = process.env.TERMS_AND_CONDITIONS_URL || '';
    const PRIVACY_POLICY_URL = process.env.PRIVACY_POLICY_URL || '';
    // Support email appears in both short templates as a mailto: link inside
    // the safety/help copy. Without this replacement the href stayed literal
    // as "mailto:{{support_email}}" and clicking broke. Constant default
    // keeps it working even without explicit env config.
    const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@2connect.ai';
    let html = template.replace(/{{\s*instagram_url\s*}}/gi, INSTAGRAM_URL);
    html = html.replace(/{{\s*twitter_url\s*}}/gi, TWITTER_URL);
    html = html.replace(/{{\s*facebook_url\s*}}/gi, FACEBOOK_URL);
    html = html.replace(/{{\s*linkedin_url\s*}}/gi, LINKEDIN_URL);
    html = html.replace(/{{\s*youtube_url\s*}}/gi, YOUTUBE_URL);
    html = html.replace(/{{\s*terms_url\s*}}/gi, TERMS_AND_CONDITIONS_URL);
    html = html.replace(/{{\s*privacy_url\s*}}/gi, PRIVACY_POLICY_URL);
    html = html.replace(/{{\s*support_email\s*}}/gi, SUPPORT_EMAIL);
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

  /**
   * Inject a hidden pre-header / preview text right after the opening <body>
   * tag. Email clients (Gmail, Apple Mail, Outlook) use the first visible
   * text as the inbox preview; without this they fall back to the logo alt
   * or the first copy line. The div is styled to collapse to 0 dimensions
   * and be invisible in the actual rendered email body.
   */
  private injectPreviewText(template: string, text: string): string {
    if (!template || !text) return template;
    // Escape raw angle brackets / quotes so preview text can contain them.
    const esc = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const hidden =
      `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;` +
      `font-size:1px;line-height:1px;color:#ffffff;visibility:hidden;opacity:0;">${esc}</div>` +
      // Zero-width non-joiners to push any body copy past Gmail's
      // preview-text window so only the hidden div shows.
      `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">` +
      '&#847;&zwnj;&nbsp;'.repeat(40) +
      `</div>`;
    return template.replace(/<body([^>]*)>/i, `<body$1>${hidden}`);
  }

  /**
   * Build the signed unsubscribe URL used in List-Unsubscribe header and
   * footer link. Only applied to the weekly-digest email — transactional
   * sends (verify, reset) don't need unsubscribe per CAN-SPAM.
   */
  private buildUnsubscribeUrl(userId: string): string | null {
    if (!userId) return null;
    const secret =
      this.config.get<string>('UNSUBSCRIBE_SECRET') ||
      this.config.get<string>('JWT_SECRET');
    if (!secret) {
      this.logger.warn('UNSUBSCRIBE_SECRET / JWT_SECRET not set — skipping unsubscribe link');
      return null;
    }
    const apiBase =
      this.config.get<string>('API_BASE_URL') || 'https://api.2connect.ai/api/v1';
    const token = signUnsubscribeToken(userId, secret);
    return `${apiBase}/auth/unsubscribe?token=${encodeURIComponent(token)}`;
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
    unsubscribeUrl?: string;
  }): Promise<boolean> {
    const { to, subject, html, textFallback, logContext, unsubscribeUrl } = params;
    const tag = logContext ? `[${logContext}] ` : '';

    this.logger.log(`${tag}Preparing to send email via SES to: ${to}`);

    // 1) Build text fallback
    const text =
      textFallback ||
      stripHtml(html) ||
      `${this.appName} notification. If you cannot view HTML, please open the app.`;

    // 2) Build RFC2369 + RFC8058 List-Unsubscribe headers for mailings that
    //    want them (weekly digest). Skip for transactional flows (verify,
    //    reset) per CAN-SPAM — they're exempt from unsubscribe requirements.
    const headers: Array<{ Name: string; Value: string }> = [];
    if (unsubscribeUrl) {
      headers.push({ Name: 'List-Unsubscribe', Value: `<${unsubscribeUrl}>` });
      headers.push({ Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' });
    }

    // 3) Prepare SES request
    const payload: any = {
      FromEmailAddress: this.fromEmail,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          ...(headers.length > 0 ? { Headers: headers } : {}),
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
        },
      },
    };

    const cmd = new SendEmailCommand(payload);

    let messageId: string | null = null;
    let sendError: string | null = null;
    let ok = false;

    try {
      const res = await this.ses.send(cmd);
      if (!res.MessageId) {
        this.logger.error(`${tag}SES returned no MessageId — email may NOT have been sent.`);
        sendError = 'SES returned no MessageId';
      } else {
        messageId = res.MessageId;
        this.logger.log(`${tag}Email successfully handed to SES for delivery.`);
        ok = true;
      }
    } catch (err) {
      const error = err as Error;
      sendError = error.message || String(err);
      this.logger.error(`${tag}SES email send FAILED: ${sendError}`);
    }

    // Audit trail. Fire-and-log: a DB hiccup should never prevent the caller
    // from learning the actual SES result — we already have the result above.
    // `user_id` is optional because some flows (signup verification) fire
    // before the transactional user row is visible outside the active tx.
    try {
      await this.emailSentModel.create({
        user_id: null,
        to_email: to,
        log_context: logContext || 'unknown',
        subject: subject.slice(0, 255),
        ses_message_id: messageId,
        success: ok,
        error_message: sendError ? sendError.slice(0, 500) : null,
      } as any);
    } catch (auditErr) {
      const e = auditErr as Error;
      this.logger.warn(`${tag}email audit insert failed (send outcome unchanged): ${e.message}`);
    }

    return ok;
  }

  /**
   * Send account verification email.
   */
  async sendAccountVerificationEmail(
    email: string,
    code: string,
    firstName?: string,
  ): Promise<boolean> {
    this.logger.log(`SEND ACCOUNT VERIFICATION EMAIL`);
    this.logger.log({ email });
    this.logger.log({ code });
    let html = this.injectCode(VerifyEmailTemplate, code);
    html = this.injectName(html, firstName || 'there');
    html = this.injectS3Url(html);
    html = this.injectSOcialMediaAndOfficialUrls(html);
    html = this.injectPreviewText(
      html,
      `Your 2Connect verification code: ${code}. Expires soon.`,
    );
    // Dedicated plain-text body — not stripped HTML, reads naturally in the
    // rare clients that show text/plain part.
    const name = firstName || 'there';
    const textFallback =
      `Hi ${name},\n\n` +
      `Use this code to verify your email for 2Connect:\n\n` +
      `    ${code}\n\n` +
      `This code will expire soon. If you didn't request this, you can safely ignore this email.\n\n` +
      `Need help? Reply to support@2connect.ai\n\n` +
      `— The 2Connect Team`;

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
  async sendForgotPasswordEmail(
    email: string,
    code: string,
    firstName?: string,
  ): Promise<boolean> {
    this.logger.log(`SEND FORGOT PASSWORD EMAIL`);
    this.logger.log({ email });
    this.logger.log({ code });

    let html = this.injectCode(forgotPasswordTemplate, code);
    html = this.injectName(html, firstName || 'there');
    html = this.injectS3Url(html);
    html = this.injectSOcialMediaAndOfficialUrls(html);
    html = this.injectPreviewText(
      html,
      `Your 2Connect password reset code: ${code}. Expires soon.`,
    );

    const name = firstName || 'there';
    const textFallback =
      `Hi ${name},\n\n` +
      `Use this code to reset your 2Connect password:\n\n` +
      `    ${code}\n\n` +
      `This code will expire soon. If you didn't request a password reset, you can safely ignore this email.\n\n` +
      `Need help? Reply to support@2connect.ai\n\n` +
      `— The 2Connect Team`;

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
    html = this.injectPreviewText(
      html,
      `${approver_name} is waiting for your response on 2Connect.`,
    );

    const frontendUrl = process.env.FRONT_END_BASE_URL || 'https://app.2connect.ai';
    const textFallback =
      `Hi ${name || 'there'},\n\n` +
      `${approver_name} is waiting for your response on 2Connect.\n\n` +
      `Open the app to respond: ${frontendUrl}\n\n` +
      `— The 2Connect Team`;

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
   * Send weekly match summary email.
   *
   * Tier-aware: when primaryCount/adjacentCount are both provided and the
   * user has at least one Adjacent match, the rendered label reads
   * `"matches (N Primary · M Adjacent)"` so the email mirrors the dashboard
   * tiering introduced Apr-17 (Follow-up 15). When the user has only
   * Primary (or only Adjacent, or the breakdown isn't available), the label
   * stays as the simple `match` / `matches` plural.
   */
  async sendWeeklyMatchSummaryEmail(
    email: string,
    firstName: string,
    count: number,
    primaryCount?: number,
    adjacentCount?: number,
    userId?: string,
  ): Promise<boolean> {
    this.logger.log(`SEND WEEKLY MATCH SUMMARY EMAIL`);
    this.logger.log({ email });
    this.logger.log({ first_name: firstName });
    this.logger.log({ count, primaryCount, adjacentCount });

    const label = buildMatchLabel(count, primaryCount, adjacentCount);
    const unsubscribeUrl = userId ? this.buildUnsubscribeUrl(userId) : null;

    let html = this.buildWeeklyMatchSummaryHtml(firstName, count, label);
    html = this.injectUrl(html);
    html = this.injectS3Url(html);
    html = this.injectSOcialMediaAndOfficialUrls(html);
    // Inline unsubscribe URL placeholder — template can use {{unsubscribe_url}}
    // in a footer link. Weekly digest template doesn't currently have one, so
    // this is preparation for a future template update; the List-Unsubscribe
    // header is what actually satisfies Gmail + CAN-SPAM today.
    if (unsubscribeUrl) {
      html = html.replace(/{{\s*unsubscribe_url\s*}}/gi, unsubscribeUrl);
    }
    html = this.injectPreviewText(
      html,
      `You appeared in ${count} new ${label} this week on 2Connect.`,
    );

    const frontendUrl = process.env.FRONT_END_BASE_URL || 'https://app.2connect.ai';
    const unsubLine = unsubscribeUrl
      ? `\n\nUnsubscribe from these emails: ${unsubscribeUrl}`
      : '';
    const textFallback =
      `Hey ${firstName || 'there'},\n\n` +
      `You appeared in ${count} new ${label} this week on 2Connect.\n\n` +
      `See your matches: ${frontendUrl}/matches\n\n` +
      `— The 2Connect Team` +
      unsubLine;

    const subject = `${this.appName} — Your weekly match summary`;

    return this.sendEmail({
      to: email,
      subject,
      html,
      textFallback,
      logContext: 'weekly-match-summary',
      unsubscribeUrl: unsubscribeUrl || undefined,
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
    html = this.injectPreviewText(
      html,
      `${sender_name} sent you a message on 2Connect.`,
    );

    const frontendUrl = process.env.FRONT_END_BASE_URL || 'https://app.2connect.ai';
    const textFallback =
      `Hi ${receiver_name || 'there'},\n\n` +
      `${sender_name} sent you a message on 2Connect.\n\n` +
      `Read it in the app: ${frontendUrl}/chat\n\n` +
      `— The 2Connect Team`;

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
   * Send an internal admin notification when a user reports another user.
   * Satisfies Apple Guideline 1.2 + Google UGC policy reviewer requirement
   * ("what happens when a user is reported?" — admin is notified within
   * 60 sec and actions via existing `reported_users` table). See
   * Analyses/ugc-moderation-gap-spec.md (Apr-20 F/u 43).
   *
   * Fire-and-forget from ChatService.reportUser — we log failure but never
   * throw back to the user's report POST; the DB row is the source of truth.
   */
  async sendAbuseReportNotification(params: {
    reportId: string;
    reporterId: string;
    reporterEmail?: string;
    reportedId: string;
    reportedEmail?: string;
    reason: string;
    details?: string;
    conversationId?: string;
  }): Promise<boolean> {
    const abuseInbox =
      process.env.ABUSE_REPORT_EMAIL ||
      process.env.SUPPORT_EMAIL ||
      'support@2connect.ai';

    this.logger.log(`SEND ABUSE REPORT NOTIFICATION to ${abuseInbox}`);
    this.logger.log({ report_id: params.reportId, reason: params.reason });

    const createdAt = new Date().toISOString();

    // Plain HTML — this is an internal ops email, no branding needed.
    // Admin copies the report_id into an SQL UPDATE to action.
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 16px;color:#B91C1C;">Abuse report submitted</h2>
        <p style="margin:0 0 16px;font-size:14px;">A user has reported another user. Review + action in <code>reported_users</code> table.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;">Report ID</td><td style="padding:6px 8px;border-bottom:1px solid #eee;"><code>${params.reportId}</code></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;">Reporter</td><td style="padding:6px 8px;border-bottom:1px solid #eee;"><code>${params.reporterId}</code>${params.reporterEmail ? ` (${params.reporterEmail})` : ''}</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;">Reported</td><td style="padding:6px 8px;border-bottom:1px solid #eee;"><code>${params.reportedId}</code>${params.reportedEmail ? ` (${params.reportedEmail})` : ''}</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;">Reason</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${this.escapeHtml(params.reason)}</td></tr>
          ${params.details ? `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;vertical-align:top;">Details</td><td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:pre-wrap;">${this.escapeHtml(params.details)}</td></tr>` : ''}
          ${params.conversationId ? `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;">Conversation</td><td style="padding:6px 8px;border-bottom:1px solid #eee;"><code>${params.conversationId}</code></td></tr>` : ''}
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;">Submitted</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${createdAt}</td></tr>
          <tr><td style="padding:6px 8px;font-weight:600;">Status</td><td style="padding:6px 8px;">pending</td></tr>
        </table>
        <h3 style="margin:24px 0 8px;font-size:14px;">Action commands</h3>
        <pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;">UPDATE reported_users SET status = 'reviewed' WHERE id = '${params.reportId}';
UPDATE reported_users SET status = 'actioned' WHERE id = '${params.reportId}';
UPDATE reported_users SET status = 'dismissed' WHERE id = '${params.reportId}';
-- To suspend the reported user:
UPDATE users SET is_active = false WHERE id = '${params.reportedId}';</pre>
        <p style="margin:16px 0 0;font-size:12px;color:#666;">Automated — ${this.appName} abuse reporting system.</p>
      </div>
    `;

    const textFallback =
      `Abuse report submitted\n\n` +
      `Report ID: ${params.reportId}\n` +
      `Reporter: ${params.reporterId}${params.reporterEmail ? ` (${params.reporterEmail})` : ''}\n` +
      `Reported: ${params.reportedId}${params.reportedEmail ? ` (${params.reportedEmail})` : ''}\n` +
      `Reason: ${params.reason}\n` +
      (params.details ? `Details: ${params.details}\n` : '') +
      (params.conversationId ? `Conversation: ${params.conversationId}\n` : '') +
      `Submitted: ${createdAt}\n` +
      `Status: pending\n\n` +
      `Action via SQL on reported_users.status. See HTML body for ready-to-run commands.\n\n` +
      `— ${this.appName} abuse reporting system`;

    const subject = `[${this.appName} Abuse Report] pending review — report #${params.reportId.slice(0, 8)}`;

    return this.sendEmail({
      to: abuseInbox,
      subject,
      html,
      textFallback,
      logContext: 'abuse-report',
    });
  }

  /**
   * Send account-deletion confirmation to the user.
   * Satisfies Apple 5.1.1(v) + Google Play account-deletion policy "clear
   * user communication". 30-day reactivation window; hard-delete completes
   * via the SchedulerService sweeper. See Analyses/account-deletion-spec.md
   * (Apr-20 F/u 43).
   */
  async sendAccountDeletionConfirmation(
    email: string,
    params: {
      firstName?: string;
      scheduledHardDelete: Date;
    },
  ): Promise<boolean> {
    this.logger.log(`SEND ACCOUNT DELETION CONFIRMATION`);
    this.logger.log({ email });

    const name = params.firstName || 'there';
    const scheduledDateFormatted = params.scheduledHardDelete.toLocaleDateString(
      'en-US',
      { year: 'numeric', month: 'long', day: 'numeric' },
    );
    const appName = this.appName;

    // Transactional email — simple template following the verify/forgot-password
    // pattern. User-facing so it gets light branding (same color + signature).
    const html = `
      <div style="font-family:Arial,sans-serif;color:#364151;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 16px;color:#190D57;font-weight:500;">Account deletion in progress</h2>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;">Hi ${this.escapeHtml(name)},</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;">We've received your request to delete your ${appName} account. Your account has been deactivated immediately — you'll be signed out on all devices and won't appear to other users.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;"><strong>Full deletion will complete on ${scheduledDateFormatted}</strong> (30 days from now). Until then, your data is retained in case you change your mind.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;"><strong>Changed your mind?</strong> Reply to this email before ${scheduledDateFormatted} and we'll restore your account.</p>
        <p style="margin:24px 0 0;font-size:14px;line-height:22px;">Need help? <a href="mailto:support@2connect.ai" style="color:#267791;font-weight:600;">support@2connect.ai</a>.</p>
        <p style="margin:24px 0 0;font-size:14px;line-height:22px;">— The ${appName} Team</p>
      </div>
    `;

    const textFallback =
      `Hi ${name},\n\n` +
      `We've received your request to delete your ${appName} account. Your account has been deactivated immediately — you'll be signed out on all devices and won't appear to other users.\n\n` +
      `Full deletion will complete on ${scheduledDateFormatted} (30 days from now). Until then, your data is retained in case you change your mind.\n\n` +
      `Changed your mind? Reply to this email before ${scheduledDateFormatted} and we'll restore your account.\n\n` +
      `Need help? support@2connect.ai\n\n` +
      `— The ${appName} Team`;

    const subject = `${appName} — Account deletion in progress`;

    return this.sendEmail({
      to: email,
      subject,
      html,
      textFallback,
      logContext: 'account-deletion',
    });
  }

  /** Minimal HTML escape for admin-facing abuse report content. */
  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

    // 1) Aggregate for user_a_id — group by reciprocal flag so we split
    //    Primary (reciprocal=true) vs Adjacent (reciprocal=false) per user.
    //    NULL reciprocal rows (pre-Apr-17 / goal not in reciprocity matrix)
    //    are lumped into the "primary" bucket so legacy matches still show
    //    up as a simple count.
    const resultsA = await this.matchModel.findAll({
      attributes: ['user_a_id', 'reciprocal', [fn('COUNT', col('Match.id')), 'match_count']],
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
      group: [
        'user_a_id',
        'reciprocal',
        'userA.id',
        'userA.email',
        'userA.first_name',
        'userA.last_name',
      ],
      raw: true,
    });
    this.logger.log({ result_a: resultsA.length });

    // 2) Aggregate for user_b_id (same split)
    const resultsB = await this.matchModel.findAll({
      attributes: ['user_b_id', 'reciprocal', [fn('COUNT', col('Match.id')), 'match_count']],
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
      group: [
        'user_b_id',
        'reciprocal',
        'userB.id',
        'userB.email',
        'userB.first_name',
        'userB.last_name',
      ],
      raw: true,
    });
    this.logger.log({ result_b: resultsB.length });

    type UserCount = {
      userId: string;
      email: string;
      firstName: string;
      lastName: string;
      count: number;
      primaryCount: number;
      adjacentCount: number;
    };

    const userMap = new Map<string, UserCount>();
    this.logger.log({ initital_user_map: userMap.size });
    const upsertUserCount = (
      userId: string,
      email: string,
      firstName: string,
      lastName: string,
      delta: number,
      reciprocal: boolean | null,
    ) => {
      const primaryDelta = reciprocal === false ? 0 : delta; // true or null
      const adjacentDelta = reciprocal === false ? delta : 0;
      const existing = userMap.get(userId);
      if (existing) {
        existing.count += delta;
        existing.primaryCount += primaryDelta;
        existing.adjacentCount += adjacentDelta;
      } else {
        userMap.set(userId, {
          userId,
          email,
          firstName,
          lastName,
          count: delta,
          primaryCount: primaryDelta,
          adjacentCount: adjacentDelta,
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
        row.reciprocal === null || row.reciprocal === undefined ? null : Boolean(row.reciprocal),
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
        row.reciprocal === null || row.reciprocal === undefined ? null : Boolean(row.reciprocal),
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

    // 3) Enqueue a job per user (carries tier breakdown for template rendering)
    for (const [, item] of userMap) {
      this.logger.log({
        email: item.email,
        firstName: item.firstName,
        count: item.count,
        primaryCount: item.primaryCount,
        adjacentCount: item.adjacentCount,
      });
      if (!item.count) continue;
      this.logger.log(`adding to queue`);
      const res = await this.weeklyMatchEmailQueue.add(
        'weekly_match_summary', // job name
        {
          email: item.email,
          firstName: item.firstName,
          count: item.count,
          primaryCount: item.primaryCount,
          adjacentCount: item.adjacentCount,
          userId: item.userId,
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

/**
 * Build the {{match_label}} string for the weekly summary email.
 *
 * Rules:
 *   - count == 1 + no tier split                       -> "match"
 *   - count > 1  + no tier split                       -> "matches"
 *   - has adjacent (both primary > 0 AND adjacent > 0) -> "matches (N Primary · M Adjacent)"
 *   - only primary (primary == count, adjacent == 0)   -> "matches" (no need to decorate)
 *   - only adjacent (primary == 0, adjacent == count)  -> "matches (N Adjacent)"
 *
 * The breakdown is only rendered when both tiers are present OR when the
 * entire set is Adjacent (minority case). Pure-Primary summaries keep the
 * simple wording because Primary is the default expectation.
 */
export function buildMatchLabel(
  count: number,
  primaryCount?: number,
  adjacentCount?: number,
): string {
  const plural = count === 1 ? 'match' : 'matches';

  if (
    typeof primaryCount !== 'number' ||
    typeof adjacentCount !== 'number' ||
    primaryCount + adjacentCount === 0
  ) {
    return plural;
  }

  // Both tiers present
  if (primaryCount > 0 && adjacentCount > 0) {
    return `${plural} (${primaryCount} Primary · ${adjacentCount} Adjacent)`;
  }

  // Only-adjacent edge case
  if (primaryCount === 0 && adjacentCount > 0) {
    return `${plural} (${adjacentCount} Adjacent)`;
  }

  // Only-primary (or breakdown matches count) — keep wording simple
  return plural;
}
