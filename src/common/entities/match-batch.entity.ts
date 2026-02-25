import { Table, Column, DataType, HasMany, CreatedAt, Model } from 'sequelize-typescript';
import { MatchBatchStatusEnum } from 'src/common/enums';
import { Match } from 'src/common/entities/match.entity';

@Table({
  tableName: 'match_batches',
  paranoid: false,
  timestamps: false,
})
export class MatchBatch extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  declare data: Record<string, any>;

  @Column({
    type: DataType.ENUM(...Object.values(MatchBatchStatusEnum)),
    allowNull: false,
    defaultValue: MatchBatchStatusEnum.DRAFT,
  })
  declare status: MatchBatchStatusEnum;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare match_date: Date;

  @HasMany(() => Match, {
    foreignKey: 'batch_id',
    as: 'matches',
  })
  declare matches: Match[];

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  declare created_at: Date;
}
