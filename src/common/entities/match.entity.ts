import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  Model,
  UpdatedAt,
  CreatedAt,
  HasMany,
  Index,
} from 'sequelize-typescript';
import { MatchBatch } from 'src/common/entities/match-batch.entity';
import { User } from 'src/common/entities/user.entity';
import { MatchStatusEnum, MatchTierEnum } from 'src/common/enums';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';

/**
 * Score dimension for multi-vector scoring
 * Matches frontend ScoreDimension interface
 */
export interface ScoreDimension {
  score: number;
  weight: number;
  weighted_score: number;
  explanation: string;
}

/**
 * Multi-vector score breakdown (6 dimensions)
 */
export interface ScoreBreakdown {
  objective_alignment: ScoreDimension;
  industry_match: ScoreDimension;
  timeline_compatibility: ScoreDimension;
  skill_complement: ScoreDimension;
  experience_level: ScoreDimension;
  communication_style: ScoreDimension;
}

/**
 * Match explanation JSONB structure
 */
export interface MatchExplanation {
  summary: string;
  generated_at: string;
}

@Table({
  tableName: 'matches',
  paranoid: false,
  timestamps: true,
  indexes: [
    {
      name: 'matches_user_pair_unique',
      unique: true,
      fields: ['user_a_id', 'user_b_id'],
    },
  ],
})
export class Match extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => MatchBatch)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare batch_id: string;

  @BelongsTo(() => MatchBatch)
  declare match_batch: MatchBatch;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare user_a_id: string;

  @BelongsTo(() => User, { as: 'userA', foreignKey: 'user_a_id', targetKey: 'id' })
  declare user_a: User;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare user_b_id: string;

  @BelongsTo(() => User, { as: 'userB', foreignKey: 'user_b_id', targetKey: 'id' })
  declare user_b: User;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare user_a_feedback: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare user_b_feedback: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare user_a_persona_compatibility_score: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare user_b_persona_compatibility_score: number;

  @Column({
    type: DataType.ENUM(...Object.values(MatchStatusEnum)),
    allowNull: true,
  })
  declare user_a_decision: MatchStatusEnum;

  @Column({
    type: DataType.ENUM(...Object.values(MatchStatusEnum)),
    allowNull: true,
  })
  declare user_b_decision: MatchStatusEnum;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare user_a_designation: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare user_b_designation: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare user_a_objective: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare user_b_objective: string;

  @Column({
    type: DataType.ENUM(...Object.values(MatchStatusEnum)),
    allowNull: true,
  })
  declare ai_remarks_after_chat: MatchStatusEnum;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare user_to_user_conversation: boolean;

  @Column({
    type: DataType.ENUM(...Object.values(MatchStatusEnum)),
    defaultValue: MatchStatusEnum.PENDING,
  })
  declare status: MatchStatusEnum;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare perfect_match: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare ai_to_ai_conversation: boolean;

  @HasMany(() => AiConversation, {
    foreignKey: 'match_id',
    as: 'ai_conversations',
  })
  declare ai_conversations: AiConversation[];

  // === Phase 1.1: Match Explanation ===
  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: 'AI-generated explanation of why users matched',
  })
  declare explanation: MatchExplanation | null;

  @Column({
    type: DataType.ARRAY(DataType.TEXT),
    allowNull: true,
    defaultValue: [],
    comment: 'Specific ways users can help each other',
  })
  declare synergy_areas: string[];

  @Column({
    type: DataType.ARRAY(DataType.TEXT),
    allowNull: true,
    defaultValue: [],
    comment: 'Potential challenges identified in conversation',
  })
  declare friction_points: string[];

  @Column({
    type: DataType.ARRAY(DataType.TEXT),
    allowNull: true,
    defaultValue: [],
    comment: 'Suggested conversation topics',
  })
  declare talking_points: string[];

  // === Phase 2.2: Multi-Vector Scoring ===
  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: 'Multi-vector score breakdown: objective, industry, timeline, skills, experience, style',
  })
  declare score_breakdown: ScoreBreakdown | null;

  // === Phase 2.3: Match Tier ===
  @Column({
    type: DataType.STRING(20),
    allowNull: true,
    comment: 'Match quality tier: perfect (85%+), strong (70-84%), worth_exploring (55-69%), low (<55%)',
  })
  declare match_tier: MatchTierEnum | null;

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
