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
  DeletedAt,
} from 'sequelize-typescript';
import { Exclude } from 'class-transformer';
import { Role } from 'src/common/entities/role.entity';
import { GenderEnum, OnboardingStatusEnum, ProviderEnum } from 'src/common/enums';
import { Match } from 'src/common/entities/match.entity';
import { MessageTemplate } from 'src/common/entities/message-template.entity';
import { Message } from 'src/common/entities/message.entity';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { UserActivityLog } from 'src/common/entities/user-activity-log.entity';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { UserOnboardingAnswer } from 'src/common/entities/user-onboarding-answer.entity';
import { VerificationCode } from 'src/common/entities/verification-code.entity';
import { UserFcmToken } from 'src/common/entities/user-fcm-token.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';

@Table({
  tableName: 'users',
  paranoid: true,
  timestamps: true,
  underscored: true,
})
@Exclude()
export class User extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => Role)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare role_id: string;

  @BelongsTo(() => Role)
  declare role: Role;

  @Column({
    type: DataType.ENUM(...Object.values(ProviderEnum)),
    allowNull: false,
    defaultValue: ProviderEnum.PASSWORD,
  })
  declare provider: ProviderEnum;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare first_name: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare last_name: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    unique: true,
  })
  declare email: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare password: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare avatar: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare linkedin_profile: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare bio: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare objective: string;

  @Column({
    type: DataType.ENUM(...Object.values(GenderEnum)),
    allowNull: true,
  })
  declare gender: GenderEnum;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  declare date_of_birth: string | null;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare is_email_verified: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare onboarding_matches: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare email_notifications: boolean;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare timezone: string;

  @Column({
    type: DataType.ENUM(...Object.values(OnboardingStatusEnum)),
    defaultValue: OnboardingStatusEnum.NOT_STARTED,
  })
  declare onboarding_status: OnboardingStatusEnum;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare is_active: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare allow_matching: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare has_requested_matches: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare is_test: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare last_login_at: Date;

  /**
   * Map of tour name → ISO8601 timestamp of first completion. Used to gate
   * first-time-user product tours per surface. Empty `{}` by default.
   * Schema: { [tourName]: "2026-04-24T10:00:00.000Z" }
   */
  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  declare tours_seen: Record<string, string>;

  @HasMany(() => Match, {
    foreignKey: 'user_a_id',
    as: 'user_matches_a',
  })
  declare user_matches_a: Match[];

  @HasMany(() => Match, {
    foreignKey: 'user_b_id',
    as: 'user_matches_b',
  })
  declare user_matches_b: Match[];

  @HasMany(() => MessageTemplate, {
    foreignKey: 'user_id',
    as: 'message_templates',
  })
  declare message_templates: MessageTemplate[];

  @HasMany(() => Message, {
    foreignKey: 'sender_id',
    as: 'messages',
  })
  declare messages: Message[];

  @HasMany(() => AiConversation, {
    foreignKey: 'user_a_id',
    as: 'ai_conversations_a',
  })
  declare ai_conversations_a: AiConversation[];

  @HasMany(() => AiConversation, {
    foreignKey: 'user_b_id',
    as: 'ai_conversations_b',
  })
  declare ai_conversations_b: AiConversation[];

  @HasMany(() => UserActivityLog, {
    foreignKey: 'user_id',
    as: 'user_activity_logs',
  })
  declare user_activity_logs: UserActivityLog[];

  @HasMany(() => UserDocument, {
    foreignKey: 'user_id',
    as: 'user_documents',
  })
  declare user_documents: UserDocument[];

  @HasMany(() => UserOnboardingAnswer, {
    foreignKey: 'user_id',
    as: 'user_onboarding_answers',
  })
  declare user_onboarding_answers: UserOnboardingAnswer[];

  @HasMany(() => VerificationCode, {
    foreignKey: 'user_id',
    as: 'verification_codes',
  })
  declare verification_codes: VerificationCode[];

  @HasMany(() => UserFcmToken, {
    foreignKey: 'user_id',
    as: 'userFcmTokens',
  })
  declare userFcmTokens: UserFcmToken[];

  @HasMany(() => UserSummaries, {
    foreignKey: 'user_id',
    as: 'userSummaries',
  })
  declare user_summaries: UserSummaries[];

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

  @DeletedAt
  @Column({
    type: DataType.DATE,
  })
  declare deleted_at: Date;
}
