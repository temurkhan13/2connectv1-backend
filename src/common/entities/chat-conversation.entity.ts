import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
  Model,
} from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';
import { ChatMessage } from 'src/common/entities/chat-message.entity';

@Table({
  tableName: 'chat_conversations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class ChatConversation extends Model {
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
  declare user1_id: string;

  @BelongsTo(() => User, 'user1_id')
  declare user1: User;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare user2_id: string;

  @BelongsTo(() => User, 'user2_id')
  declare user2: User;

  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  declare match_id: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare last_message_at: Date;

  @HasMany(() => ChatMessage)
  declare messages: ChatMessage[];

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}
