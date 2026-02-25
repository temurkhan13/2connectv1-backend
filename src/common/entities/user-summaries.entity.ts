import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  UpdatedAt,
  CreatedAt,
  Model,
} from 'sequelize-typescript';
import { Exclude } from 'class-transformer';
import { User } from 'src/common/entities/user.entity';
import { SummaryStatusEnum } from 'src/common/enums';

/**
 * Urgency levels for user needs
 * Phase 3.1: Temporal Relevance
 */
export enum UrgencyEnum {
  URGENT = 'urgent',
  TIME_SENSITIVE = 'time_sensitive',
  ONGOING = 'ongoing',
  EXPLORATORY = 'exploratory',
}

@Table({
  tableName: 'user_summaries',
  paranoid: false,
  timestamps: true,
  underscored: true,
})
@Exclude()
export class UserSummaries extends Model {
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
  })
  declare user_id: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.ENUM(...Object.values(SummaryStatusEnum)),
    allowNull: false,
  })
  declare status: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare summary: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare version: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare webhook: boolean;

  // === Phase 3.1: Temporal Relevance ===
  @Column({
    type: DataType.ENUM(...Object.values(UrgencyEnum)),
    allowNull: false,
    defaultValue: UrgencyEnum.ONGOING,
  })
  declare urgency: UrgencyEnum;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    comment: 'When the user need expires',
  })
  declare need_expires_at: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    defaultValue: DataType.NOW,
  })
  declare last_active_at: Date | null;

  @Column({
    type: DataType.DECIMAL(3, 2),
    allowNull: true,
    defaultValue: 1.0,
    comment: 'Decays over time, 1.0 = fresh, 0.0 = stale',
  })
  declare freshness_score: number | null;

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
