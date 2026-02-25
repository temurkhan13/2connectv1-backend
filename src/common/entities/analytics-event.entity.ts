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
 * Analytics Event Entity
 * Phase 4.3: Success Metrics Pipeline - raw event tracking
 */

export type EventType =
  | 'signup'
  | 'onboarding_start'
  | 'onboarding_section_complete'
  | 'onboarding_complete'
  | 'match_received'
  | 'match_view'
  | 'match_approve'
  | 'match_decline'
  | 'ai_chat_start'
  | 'ai_chat_message'
  | 'ai_chat_complete'
  | 'message_sent'
  | 'message_received'
  | 'profile_view'
  | 'interest_expressed'
  | 'connection_made'
  | 'feedback_submitted';

export type EventCategory =
  | 'onboarding'
  | 'matching'
  | 'messaging'
  | 'discovery'
  | 'engagement';

@Table({
  tableName: 'analytics_events',
  timestamps: false,
  paranoid: false,
})
export class AnalyticsEvent extends Model {
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
  })
  declare user_id: string | null;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
    comment: 'Browser/app session identifier',
  })
  declare session_id: string | null;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  declare event_type: EventType;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  declare event_category: EventCategory | null;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    defaultValue: {},
  })
  declare event_data: Record<string, any>;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Numeric value for aggregation',
  })
  declare event_value: number | null;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
    comment: 'web, mobile, api',
  })
  declare source: string | null;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare utm_source: string | null;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare utm_medium: string | null;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare utm_campaign: string | null;

  @CreatedAt
  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  declare created_at: Date;
}
