/**
 * Notification Settings Entity
 * User preferences for push notifications and email notifications
 */

import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  UpdatedAt,
  Model,
  PrimaryKey,
} from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';

@Table({
  tableName: 'notification_settings',
  paranoid: false,
  timestamps: true,
  underscored: true,
  createdAt: false, // Only track updates, not creation
})
export class NotificationSettings extends Model {
  @PrimaryKey
  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare user_id: string;

  @BelongsTo(() => User, { onDelete: 'CASCADE' })
  declare user: User;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Master switch for push notifications',
  })
  declare push_enabled: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Master switch for email notifications',
  })
  declare email_enabled: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Receive notifications for new matches',
  })
  declare match_notifications: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Receive notifications for new messages',
  })
  declare message_notifications: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Receive weekly digest email',
  })
  declare weekly_digest: boolean;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
  })
  declare updated_at: Date;
}
