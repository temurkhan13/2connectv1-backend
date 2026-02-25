import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  Model,
} from 'sequelize-typescript';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { User } from 'src/common/entities/user.entity';

@Table({
  tableName: 'messages',
  paranoid: false,
  timestamps: false,
})
export class Message extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => AiConversation)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare conversation_id: string;

  @BelongsTo(() => AiConversation)
  declare conversation: AiConversation;

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
    type: DataType.JSONB,
    allowNull: true,
  })
  declare metadata: Record<string, any>;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    defaultValue: null,
  })
  sort_order!: number;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  declare created_at: Date;
}
