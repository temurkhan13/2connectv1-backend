import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  Model,
  UpdatedAt,
  CreatedAt,
} from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';

/**
 * Learned preference pattern structure
 */
export interface PreferencePattern {
  value: string;
  count: number;
  weight: number;
}

/**
 * User Preferences Learned Entity
 * -------------------------------
 * Phase 2.1: Feedback Learning Loop
 * Stores learned patterns from user feedback for match scoring refinement
 */
@Table({
  tableName: 'user_preferences_learned',
  paranoid: false,
  timestamps: true,
})
export class UserPreferencesLearned extends Model {
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
    type: DataType.STRING(50),
    allowNull: false,
    comment: 'Type of preference (industry, role, seniority, etc.)',
  })
  declare preference_type: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Patterns from approved matches',
  })
  declare positive_patterns: PreferencePattern[];

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Patterns from declined matches',
  })
  declare negative_patterns: PreferencePattern[];

  @Column({
    type: DataType.DECIMAL(3, 2),
    allowNull: true,
    defaultValue: 0.5,
    comment: 'Confidence in learned patterns (0.00-1.00)',
  })
  declare confidence: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: 'Number of feedback samples used for learning',
  })
  declare sample_count: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    comment: 'When preferences were last retrained',
  })
  declare last_trained_at: Date | null;

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
