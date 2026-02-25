import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  Model,
  CreatedAt,
  UpdatedAt,
  HasMany,
} from 'sequelize-typescript';
import { OnboardingSection } from 'src/common/entities/onboarding-section.entity';
import { UserOnboardingAnswer } from 'src/common/entities/user-onboarding-answer.entity';

@Table({
  tableName: 'onboarding_questions',
  paranoid: false,
  timestamps: true,
})
export class OnboardingQuestion extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => OnboardingSection)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare section_id: string;

  @BelongsTo(() => OnboardingSection)
  declare onboarding_section: OnboardingSection;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare code: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare prompt: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare narration: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare description: string;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
  })
  declare input_type: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
  })
  declare comma_separated: boolean;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  declare options: Record<string, any>;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare suggestion_chips: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare is_required: boolean;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare display_order: number;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare is_active: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare has_nested_question: boolean;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  declare nested_question: Record<string, any>;

  @HasMany(() => UserOnboardingAnswer, {
    foreignKey: 'question_id',
    as: 'user_answers',
  })
  declare user_answers: UserOnboardingAnswer[];

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
