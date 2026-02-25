import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  Model,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';

@Table({
  tableName: 'user_documents',
  paranoid: false,
  timestamps: true,
})
export class UserDocument extends Model {
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
  declare type: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
    defaultValue: null,
  })
  declare title: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare url: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  declare parsed_metadata: Record<string, any>;

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
