import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  Model,
} from 'sequelize-typescript';
import { User } from './user.entity';

/**
 * Email audit trail.
 *
 * Purpose: one row per transactional-email SES call (successful or failed).
 * Use cases:
 *   - Support: "did the email actually go out?" — look up by `to_email`
 *   - Compliance: "when did this user last get a weekly digest?"
 *   - Debug: cross-ref SES MessageId in backend log with bounce/complaint
 *     SNS events
 *
 * Not for:
 *   - Deliverability decisions (SES handles that via suppression list)
 *   - Replay/retry (SES queues internally; this table is passive)
 */
@Table({
  tableName: 'emails_sent',
  timestamps: false,
  paranoid: false,
})
export class EmailSent extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    comment: 'null for pre-signup sends (e.g. signup verification before user row commits)',
  })
  declare user_id: string | null;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare to_email: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    comment: 'log_context from MailService: verify-email, forgot-password, new-message, weekly-match-summary, awaiting-response',
  })
  declare log_context: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare subject: string | null;

  @Column({
    type: DataType.STRING(128),
    allowNull: true,
    comment: 'SES MessageId returned from SendEmailCommand — used to correlate with SNS bounce/complaint events',
  })
  declare ses_message_id: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare success: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: 'Short SES/SDK error message when success=false',
  })
  declare error_message: string | null;

  @CreatedAt
  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  declare sent_at: Date;
}
