import { Table, Column, DataType, CreatedAt, UpdatedAt, Model } from 'sequelize-typescript';

/**
 * Funnel Metric Entity
 * Phase 4.3: Success Metrics Pipeline - aggregated funnel data
 */

export type FunnelStage =
  | 'signup'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'first_match'
  | 'first_approve'
  | 'first_ai_chat'
  | 'first_message'
  | 'first_connection';

@Table({
  tableName: 'funnel_metrics',
  timestamps: true,
  paranoid: false,
})
export class FunnelMetric extends Model {
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
  declare date: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  declare stage: FunnelStage;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare count: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare unique_users: number;

  @Column({
    type: DataType.DECIMAL(5, 4),
    allowNull: true,
    comment: 'Conversion rate from previous stage',
  })
  declare conversion_rate: number | null;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Average time from previous funnel stage',
  })
  declare avg_time_from_previous_hours: number | null;

  @Column({
    type: DataType.STRING(10),
    allowNull: true,
    comment: 'YYYY-WW format for cohort analysis',
  })
  declare cohort_week: string | null;

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
