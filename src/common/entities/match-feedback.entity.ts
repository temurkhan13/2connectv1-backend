import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  Model,
  CreatedAt,
} from 'sequelize-typescript';
import { Match } from 'src/common/entities/match.entity';
import { User } from 'src/common/entities/user.entity';

/**
 * Match Feedback Entity
 * ---------------------
 * Phase 2.1: Feedback Learning Loop
 * Records each match decision with structured reasons for AI learning
 */
@Table({
  tableName: 'match_feedback',
  paranoid: false,
  timestamps: false, // Only created_at, no updated_at
})
export class MatchFeedback extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => Match)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare match_id: string;

  @BelongsTo(() => Match)
  declare match: Match;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare user_id: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    comment: 'approved or declined',
  })
  declare decision: string;

  @Column({
    type: DataType.ARRAY(DataType.TEXT),
    allowNull: true,
    defaultValue: [],
    comment: 'Structured reason tags (e.g., wrong_industry, not_relevant)',
  })
  declare reason_tags: string[];

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: 'Free-text explanation from user',
  })
  declare reason_text: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    comment: 'Time taken to make decision (for engagement analysis)',
  })
  declare decision_time_ms: number | null;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: 'Snapshot of other user profile attributes at decision time',
  })
  declare other_user_attributes: Record<string, any> | null;

  @CreatedAt
  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  declare created_at: Date;
}
