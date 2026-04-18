import {
  Table,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  UpdatedAt,
  CreatedAt,
  Model,
} from 'sequelize-typescript';
import { Exclude } from 'class-transformer';
import { User } from 'src/common/entities/user.entity';
import { SummaryStatusEnum } from 'src/common/enums';

/**
 * Urgency levels for user needs
 * Phase 3.1: Temporal Relevance
 */
export enum UrgencyEnum {
  URGENT = 'urgent',
  TIME_SENSITIVE = 'time_sensitive',
  ONGOING = 'ongoing',
  EXPLORATORY = 'exploratory',
}

@Table({
  tableName: 'user_summaries',
  paranoid: false,
  timestamps: true,
  underscored: true,
})
@Exclude()
export class UserSummaries extends Model {
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
    type: DataType.ENUM(...Object.values(SummaryStatusEnum)),
    allowNull: false,
  })
  declare status: string;

  /**
   * Persona summary in markdown format (or legacy JSON for pre-Mar rows).
   *
   * STORAGE: raw. Includes the owner's real name in the `# Name` header
   * line and any identifying details the persona LLM produced. Reading
   * this field directly gives you the unredacted source.
   *
   * WHEN USED BY OWNER (profile self-view) — read raw. That is the only
   * legitimate raw-text read path; see `profile.service.ts:getSummary`.
   *
   * WHEN USED BY ANYONE ELSE (Discover, admin dashboards, match preview
   * overlays, email digests, analytics dumps shared outside the platform
   * team, future cross-user surfaces) — you MUST route the value through
   * `anonymizeForCrossUserView(summary)` from
   * `src/common/utils/profile-anonymize.util.ts` before returning /
   * rendering / forwarding it. That function handles markdown parsing,
   * identity stripping, legacy JSON fallback, and PII scrub.
   *
   * See [[Apr-18]] Follow-up 27 (session log at
   * `C:/Users/hp/2ConnectVault/Sessions/2026/04/Apr-18.md`) for why
   * anonymization is a separate sanctioned utility rather than an
   * automatic Sequelize getter: the owner's profile page legitimately
   * needs raw text, and an implicit getter would have broken that read
   * path.
   */
  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare summary: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare version: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare webhook: boolean;

  // === Phase 3.1: Temporal Relevance ===
  @Column({
    type: DataType.ENUM(...Object.values(UrgencyEnum)),
    allowNull: false,
    defaultValue: UrgencyEnum.ONGOING,
  })
  declare urgency: UrgencyEnum;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    comment: 'When the user need expires',
  })
  declare need_expires_at: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    defaultValue: DataType.NOW,
  })
  declare last_active_at: Date | null;

  @Column({
    type: DataType.DECIMAL(3, 2),
    allowNull: true,
    defaultValue: 1.0,
    comment: 'Decays over time, 1.0 = fresh, 0.0 = stale',
  })
  declare freshness_score: number | null;

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
