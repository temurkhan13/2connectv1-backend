import { Table, Column, DataType, CreatedAt, Model } from 'sequelize-typescript';

@Table({ tableName: 'reported_users', timestamps: false })
export class ReportedUser extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare reporter_id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare reported_id: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare conversation_id: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare reason: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare details: string;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'pending' })
  declare status: 'pending' | 'reviewed' | 'actioned' | 'dismissed';

  @CreatedAt
  @Column({ type: DataType.DATE })
  declare created_at: Date;
}
