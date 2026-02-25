import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Model,
  HasMany,
} from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';
import { Match } from 'src/common/entities/match.entity';
import { ConversationStatusEnum } from 'src/common/enums';
import { Message } from 'src/common/entities/message.entity';

/**
 * Rich verdict details structure
 * Phase 1.3: Rich AI Verdicts
 */
export interface VerdictDetails {
  overall_assessment: string;
  compatibility_factors: {
    factor: string;
    score: number;
    explanation: string;
  }[];
  risk_factors?: string[];
  opportunity_areas?: string[];
}

@Table({
  tableName: 'ai_conversations',
  timestamps: true,
  paranoid: false,
})
export class AiConversation extends Model {
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
  declare user_a_id: string;

  @BelongsTo(() => User, 'user_a_id')
  declare user_a: User;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare user_b_id: string;

  @BelongsTo(() => User, 'user_b_id')
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

  @ForeignKey(() => Match)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare match_id: string;

  @BelongsTo(() => Match)
  declare match: Match;

  @Column({
    type: DataType.ENUM(...Object.values(ConversationStatusEnum)),
    defaultValue: ConversationStatusEnum.OPEN,
    allowNull: false,
  })
  declare status: ConversationStatusEnum;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare ai_remarks: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare compatibility_score: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare user_to_user_conversation: boolean;

  @HasMany(() => Message, {
    foreignKey: 'conversation_id',
    as: 'messages',
  })
  declare messages: Message[];

  // === Phase 1.3: Rich AI Verdicts ===
  @Column({
    type: DataType.JSONB,
    allowNull: true,
    defaultValue: null,
    comment: 'Detailed verdict with synergy areas, friction points, risk factors',
  })
  declare verdict_details: VerdictDetails | null;

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
    comment: 'Topics users should discuss in their real chat',
  })
  declare suggested_topics: string[];

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: 'AI recommended next action (e.g., "Schedule a 30-min call")',
  })
  declare recommended_next_step: string | null;

  @Column({
    type: DataType.DECIMAL(3, 2),
    allowNull: true,
    comment: 'AI confidence in the verdict (0.00-1.00)',
  })
  declare confidence_level: number | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: 'Personalized conversation starter based on the AI chat',
  })
  declare ice_breaker: string | null;

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
