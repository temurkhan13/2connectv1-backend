import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  Model,
  CreatedAt,
} from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';

@Table({
  tableName: 'user_activity_logs',
  paranoid: false,
  timestamps: false,
})
export class UserActivityLog extends Model {
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
  })
  declare event_type: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare event_time: Date;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  declare metadata: Record<string, any>;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  declare created_at: Date;
}
