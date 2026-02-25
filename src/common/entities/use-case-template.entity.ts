import {
  Table,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
  Model,
} from 'sequelize-typescript';

/**
 * Use Case Template Entity
 * Phase 3.2: Different AI prompts for fundraising/hiring/advisory
 */

export interface SuccessCriteria {
  [key: string]: boolean;
}

export interface VerdictCriteria {
  approved_threshold: number;
  key_factors: string[];
}

export interface MatchWeightOverrides {
  objective_alignment?: number;
  industry_match?: number;
  timeline_compatibility?: number;
  skill_complement?: number;
  experience_level?: number;
  communication_style?: number;
}

@Table({
  tableName: 'use_case_templates',
  timestamps: true,
  paranoid: false,
})
export class UseCaseTemplate extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    unique: true,
  })
  declare objective_code: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare display_name: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare description: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    comment: 'System prompt for AI conversations with this objective',
  })
  declare ai_chat_system_prompt: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Criteria for evaluating conversation success',
  })
  declare success_criteria: SuccessCriteria;

  @Column({
    type: DataType.ARRAY(DataType.TEXT),
    allowNull: false,
    defaultValue: [],
    comment: 'Key questions the AI should explore',
  })
  declare key_questions: string[];

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Criteria for match verdict',
  })
  declare verdict_criteria: VerdictCriteria;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: 'Override default match weights for this use case',
  })
  declare match_weight_overrides: MatchWeightOverrides | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare is_active: boolean;

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
