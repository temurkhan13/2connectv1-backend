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
import { CodeTypeEnum } from 'src/common/enums';

@Table({
  tableName: 'verification_codes',
  paranoid: false,
  timestamps: false,
})
export class VerificationCode extends Model {
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
    type: DataType.ENUM(...Object.values(CodeTypeEnum)),
    allowNull: false,
  })
  declare type: CodeTypeEnum;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare code: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare expires_at: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare consumed_at: Date;

  @CreatedAt
  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare created_at: Date;
}
