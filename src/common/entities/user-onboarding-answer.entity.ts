import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  Model,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';
import { OnboardingSection } from 'src/common/entities/onboarding-section.entity';
import { OnboardingQuestion } from 'src/common/entities/onboarding-question.entity';

@Table({
  tableName: 'user_onboarding_answers',
  paranoid: false,
  timestamps: true,
})
export class UserOnboardingAnswer extends Model {
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

  @ForeignKey(() => OnboardingSection)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  declare section_id: string;

  @BelongsTo(() => OnboardingSection)
  declare onboarding_section: OnboardingSection;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  declare answer: Record<string, any>;

  @ForeignKey(() => OnboardingQuestion)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  declare question_id: string;
  @BelongsTo(() => OnboardingQuestion)
  declare onboarding_question: OnboardingQuestion;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare user_response: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare user_input_response: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare prompt: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare code: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare display_order: number;

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
