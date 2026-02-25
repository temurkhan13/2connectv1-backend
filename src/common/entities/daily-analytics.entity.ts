import { Table, Column, DataType, Model, CreatedAt, UpdatedAt } from 'sequelize-typescript';

@Table({
  tableName: 'daily_analytics',
  timestamps: true,
})
export class DailyAnalytics extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  declare date: Date;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare signups: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare logins: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare onboarding_completed: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare summaries_created: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare personas_created: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare matches_total: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare matches_approved: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare matches_declined: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare matches_ai_rejected: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare matches_ai_accepted: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare conversations_ai_to_ai: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare conversations_user_to_user: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare perfect_matches: number;

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
