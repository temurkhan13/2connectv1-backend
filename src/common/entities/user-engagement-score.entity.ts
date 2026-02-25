import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Model,
} from 'sequelize-typescript';
import { User } from './user.entity';

/**
 * User Engagement Score Entity
 * Phase 4.3: Success Metrics Pipeline - per-user engagement tracking
 */

export enum ActivityLevelEnum {
  DORMANT = 'dormant',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  POWER_USER = 'power_user',
}

@Table({
  tableName: 'user_engagement_scores',
  timestamps: true,
  paranoid: false,
})
export class UserEngagementScore extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
  })
  declare user_id: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0,
    comment: '0-100 scale',
  })
  declare engagement_score: number;

  @Column({
    type: DataType.ENUM(...Object.values(ActivityLevelEnum)),
    allowNull: false,
    defaultValue: ActivityLevelEnum.LOW,
  })
  declare activity_level: ActivityLevelEnum;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare days_since_last_activity: number | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare total_matches_received: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare total_matches_approved: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare total_ai_chats_completed: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare total_messages_sent: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare total_connections_made: number;

  @Column({
    type: DataType.DECIMAL(5, 4),
    allowNull: true,
  })
  declare approval_rate: number | null;

  @Column({
    type: DataType.DECIMAL(5, 4),
    allowNull: true,
  })
  declare response_rate: number | null;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
  })
  declare avg_response_time_hours: number | null;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare last_calculated_at: Date;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  declare created_at: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
  })
  declare updated_at: Date;
}
