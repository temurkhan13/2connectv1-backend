import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Model,
} from 'sequelize-typescript';
import { User } from './user.entity';

/**
 * Connection Interest Entity
 * Phase 3.3: Interactive Search/Browse - expressing interest in profiles
 */

export enum ConnectionInterestStatusEnum {
  PENDING = 'pending',
  MUTUAL = 'mutual',
  DECLINED = 'declined',
  EXPIRED = 'expired',
}

@Table({
  tableName: 'connection_interests',
  timestamps: true,
  paranoid: false,
})
export class ConnectionInterest extends Model {
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
  declare from_user_id: string;

  @BelongsTo(() => User, 'from_user_id')
  declare from_user: User;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare to_user_id: string;

  @BelongsTo(() => User, 'to_user_id')
  declare to_user: User;

  @Column({
    type: DataType.ENUM(...Object.values(ConnectionInterestStatusEnum)),
    allowNull: false,
    defaultValue: ConnectionInterestStatusEnum.PENDING,
  })
  declare status: ConnectionInterestStatusEnum;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: 'Optional message with interest expression',
  })
  declare message: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    comment: 'Interest expires after 7 days if not mutual',
  })
  declare expires_at: Date | null;

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
