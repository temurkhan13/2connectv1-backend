import {
  Table,
  Column,
  DataType,
  HasMany,
  Model,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from 'src/common/entities/user.entity';

@Table({
  tableName: 'roles',
  paranoid: false,
  timestamps: true,
})
export class Role extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(100),
    unique: true,
    allowNull: false,
  })
  declare title: string;

  @HasMany(() => User)
  users: User[];

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
