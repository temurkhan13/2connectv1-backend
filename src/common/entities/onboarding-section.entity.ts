import {
  Table,
  Column,
  DataType,
  Model,
  CreatedAt,
  UpdatedAt,
  HasMany,
} from 'sequelize-typescript';
import { OnboardingQuestion } from 'src/common/entities/onboarding-question.entity';
import { UserOnboardingAnswer } from 'src/common/entities/user-onboarding-answer.entity';

@Table({
  tableName: 'onboarding_sections',
  paranoid: false,
  timestamps: true,
})
export class OnboardingSection extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare title: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare code: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare description: string;

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

  @HasMany(() => OnboardingQuestion, {
    foreignKey: 'section_id',
    as: 'questions',
  })
  declare questions: OnboardingQuestion[];

  @HasMany(() => UserOnboardingAnswer, {
    foreignKey: 'section_id',
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
