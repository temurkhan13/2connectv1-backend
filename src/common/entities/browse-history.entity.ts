import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  Model,
} from 'sequelize-typescript';
import { User } from './user.entity';

/**
 * Browse History Entity
 * Phase 3.3: Interactive Search/Browse - tracking profile views
 */

@Table({
  tableName: 'browse_history',
  timestamps: false,
  paranoid: false,
})
export class BrowseHistory extends Model {
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
  declare viewer_id: string;

  @BelongsTo(() => User, 'viewer_id')
  declare viewer: User;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare viewed_user_id: string;

  @BelongsTo(() => User, 'viewed_user_id')
  declare viewed_user: User;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare view_duration_seconds: number | null;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
    comment: 'search, recommendation, browse, etc.',
  })
  declare source: string | null;

  @CreatedAt
  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  declare created_at: Date;
}
