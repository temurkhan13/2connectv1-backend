import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  Model,
  UpdatedAt,
  CreatedAt,
} from 'sequelize-typescript';
import { Match } from 'src/common/entities/match.entity';
import { User } from 'src/common/entities/user.entity';

/**
 * Ice Breaker Entity
 * ------------------
 * Phase 1.2: Guided First Message
 * Stores AI-generated conversation starters for each match/user pair
 */
@Table({
  tableName: 'ice_breakers',
  paranoid: false,
  timestamps: true,
})
export class IceBreaker extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => Match)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare match_id: string;

  @BelongsTo(() => Match)
  declare match: Match;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare user_id: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.ARRAY(DataType.TEXT),
    allowNull: false,
    comment: 'Array of AI-generated conversation starters',
  })
  declare suggestions: string[];

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    comment: 'Index of the suggestion the user selected (for analytics)',
  })
  declare selected_suggestion: number | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    comment: 'When the user actually used an ice breaker',
  })
  declare used_at: Date | null;

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
