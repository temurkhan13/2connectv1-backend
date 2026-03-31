import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  Model,
} from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';
import { ChatConversation } from 'src/common/entities/chat-conversation.entity';

@Table({
  tableName: 'chat_messages',
  timestamps: false,
})
export class ChatMessage extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => ChatConversation)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare conversation_id: string;

  @BelongsTo(() => ChatConversation)
  declare conversation: ChatConversation;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare sender_id: string;

  @BelongsTo(() => User)
  declare sender: User;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare content: string;

  @Column({
    type: DataType.ENUM('text', 'image', 'system'),
    allowNull: false,
    defaultValue: 'text',
  })
  declare message_type: 'text' | 'image' | 'system';

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare read_at: Date;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  declare created_at: Date;
}
