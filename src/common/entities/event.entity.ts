import {
  Column,
  Model,
  Table,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './user.entity';

@Table({ tableName: 'events', timestamps: true, underscored: true })
export class Event extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  id: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  description: string;

  @Column({ type: DataType.DATE, allowNull: false })
  event_date: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  event_end_date: Date;

  @Column({ type: DataType.STRING(255), allowNull: true })
  venue: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  city: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  country: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  logo_url: string;

  @Column({ type: DataType.STRING(20), allowNull: false, unique: true })
  access_code: string;

  @Column({ type: DataType.INTEGER, defaultValue: 500 })
  max_participants: number;

  @Column({ type: DataType.STRING(20), defaultValue: 'upcoming' })
  status: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  organiser_name: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  organiser_email: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true })
  created_by: string;

  @BelongsTo(() => User, 'created_by')
  creator: User;

  @HasMany(() => EventParticipant)
  participants: EventParticipant[];

  @CreatedAt
  created_at: Date;

  @UpdatedAt
  updated_at: Date;
}

@Table({ tableName: 'event_participants', timestamps: false, underscored: true })
export class EventParticipant extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  user_id: string;

  @ForeignKey(() => Event)
  @Column({ type: DataType.UUID, allowNull: false })
  event_id: string;

  @Column({ type: DataType.ARRAY(DataType.STRING), allowNull: false, defaultValue: [] })
  goals: string[];

  @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
  joined_at: Date;

  @BelongsTo(() => User, 'user_id')
  user: User;

  @BelongsTo(() => Event, 'event_id')
  event: Event;
}

@Table({ tableName: 'event_match_badges', timestamps: false, underscored: true })
export class EventMatchBadge extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  id: string;

  @ForeignKey(() => Event)
  @Column({ type: DataType.UUID, allowNull: false })
  event_id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  match_id: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  goal_complementary: boolean;

  @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
  created_at: Date;

  @BelongsTo(() => Event, 'event_id')
  event: Event;
}
