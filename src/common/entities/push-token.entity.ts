/**
 * Push Token Entity
 * Stores Expo push notification tokens for mobile app
 *
 * This is separate from UserFcmToken which stores FCM tokens as arrays.
 * Push tokens are stored individually with platform and device tracking.
 */

import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  UpdatedAt,
  CreatedAt,
  Model,
  Index,
} from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';

@Table({
  tableName: 'push_tokens',
  paranoid: false,
  timestamps: true,
  underscored: true,
  indexes: [
    {
      name: 'idx_push_tokens_user_id',
      fields: ['user_id'],
    },
    {
      name: 'idx_push_tokens_user_device',
      unique: true,
      fields: ['user_id', 'device_id'],
    },
  ],
})
export class PushToken extends Model {
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

  @BelongsTo(() => User, { onDelete: 'CASCADE' })
  declare user: User;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    comment: 'Expo push token (ExponentPushToken[xxx])',
  })
  declare token: string;

  @Column({
    type: DataType.ENUM('ios', 'android'),
    allowNull: false,
  })
  declare platform: 'ios' | 'android';

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    comment: 'Unique device identifier',
  })
  declare device_id: string;

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

  @Column({
    type: DataType.DATE,
    allowNull: true,
    comment: 'Last time a notification was sent to this token',
  })
  declare last_used_at: Date;
}
