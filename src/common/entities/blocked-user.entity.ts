import { Table, Column, DataType, CreatedAt, Model } from 'sequelize-typescript';

@Table({ tableName: 'blocked_users', timestamps: false })
export class BlockedUser extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare blocker_id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare blocked_id: string;

  @CreatedAt
  @Column({ type: DataType.DATE })
  declare created_at: Date;
}
