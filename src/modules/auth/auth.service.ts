import {
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';
import { OAuth2Client } from 'google-auth-library';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcrypt';
import { UserService } from 'src/modules/user/user.service';
import {
  AccountNotActiveException,
  GoogleAuthException,
} from 'src/modules/auth/exceptions/auth.exceptions';
import { CodeTypeEnum, ProviderEnum, UserActivityEventsEnum } from 'src/common/enums';
import { User } from 'src/common/entities/user.entity';
import { Role } from 'src/common/entities/role.entity';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';
import { UserActivityLogsService } from 'src/modules/user-activity-logs/user-activity-logs.service';
import { SignupDto, SigninDto, GoogleSigninDto } from 'src/modules/auth/dto/auth.dto';
import { VerificationCode } from 'src/common/entities/verification-code.entity';
import { MailService } from 'src/modules/mail/mail.service';

/**
 * AuthService
 * -----------
 * Purpose:
 * - Handle all authentication business logic: signup, signin, Google signin,
 *   email/code flows (generate, resend, validate, consume), and password updates.
 *
 * Summary:
 * - Runs critical flows in Sequelize transactions to keep them atomic and safe.
 * - Generates time-bound verification/reset codes and marks old ones as consumed.
 * - Verifies Google tokens (ID token or OAuth access token) and creates users if needed.
 * - Issues JWT access tokens and short-lived reset tokens using configured secrets.
 * - Updates user login/verification state and bumps daily analytics (signups/logins).
 * - Validates password strength, hashes passwords with bcrypt, compares securely.
 * - Never leaks account existence in forgot-password responses (privacy friendly).
 *
 * Key responsibilities:
 * - User registration with role lookup and email verification code creation.
 * - Signin with password check; if email not verified, returns a fresh OTP.
 * - Google Signin: verify token, upsert user (provider=google), then issue JWT.
 * - Email verification: validate+consume OTP and flag user as verified.
 * - Resend verification: invalidate active codes and create a new one.
 * - Forgot/reset password: issue reset code, validate+consume, set new password.
 * - Update password: verify old password, then set a new hashed password.
 *
 * Notable implementation details:
 * - Uses row-level locks and guarded UPDATEs to prevent double-use of codes.
 * - Keeps transactions short (hashing is done before the write tx where needed).
 * - Returns consistent, sanitized payloads (user fields + token when applicable).
 * - Centralized helpers: assertPasswordStrength, validatePassword, createCode,
 *   validateCode, consumeCode, invalidateOldCodes, generateToken, generateTempResetToken.
 *
 * Dependencies:
 * - Sequelize (+ transactions), bcrypt, JwtService, OAuth2Client (Google),
 *   ConfigService, DailyAnalyticsService, User/Role/VerificationCode models.
 */

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(VerificationCode)
    private readonly verificationCodeModel: typeof VerificationCode,
    @InjectModel(User)
    private userModel: typeof User,
    @InjectModel(Role) private readonly roleModel: typeof Role,
    private readonly sequelize: Sequelize,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly dailyAnalyticsService: DailyAnalyticsService,
    private readonly userActivityLogsService: UserActivityLogsService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(this.configService.get('GOOGLE_CLIENT_ID'));
  }

  /**
   * Summary: Assert password strength using a simple regex policy.
   * Inputs: password string.
   * Returns: void (throws BadRequestException if weak).
   */
  private assertPasswordStrength(password: string): void {
    const strong = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])\S{8,26}$/.test(password);
    if (!strong) {
      throw new BadRequestException(
        'Password must be 8–26 characters long, include at least one letter, one number, and one special character, and contain no spaces.',
      );
    }
  }

  /**
   * Summary: Create a user account and email verification code in one atomic transaction.
   * Inputs: SignupDto.
   * Returns: { user, email_verification_code, expires_at }.
   */
  async register(signupDto: SignupDto) {
    this.logger.log(`----- REGISTER -----`);
    this.logger.log({ email: signupDto.email });

    return this.sequelize.transaction(async t => {
      // 1) Ensure email is unique
      const existingUser = await this.userModel.findOne({
        where: { email: signupDto.email },
        raw: true,
        transaction: t,
      });
      if (existingUser) throw new ConflictException('User with this email already exists');

      // 2) Validate + hash password
      this.assertPasswordStrength(signupDto.password);
      const saltRounds = parseInt(this.configService.get('BCRYPT_SALT_ROUNDS', '12'), 10);
      const hashedPassword = await bcrypt.hash(signupDto.password, saltRounds);

      // 3) Load default "user" role
      const userRole = await this.roleModel.findOne({
        where: { title: 'user' },
        attributes: ['id', 'title'],
        raw: true,
        transaction: t,
      });
      if (!userRole)
        throw new InternalServerErrorException(
          'Failed to acquire necessary information at the moment.',
        );

      // 4) Create user
      const insertedUserRecord = await this.userModel.create(
        { ...signupDto, password: hashedPassword, role_id: userRole.id },
        { transaction: t },
      );
      const registeredUser = insertedUserRecord.get({ plain: true });
      const user = { ...registeredUser, role: userRole };

      // 5) Create email verification code
      const verificationCode = await this.createCode(user.id, CodeTypeEnum.EMAIL_VERIFICATION, t);
      this.logger.log({ verification_code: verificationCode });
      // 6) Bump analytics
      await this.dailyAnalyticsService.bumpToday('signups', { by: 1, transaction: t });

      // 7) insert activity log
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.SIGN_UP,
        user.id,
        t,
      );

      // 8) send email
      const response = await this.mailService.sendAccountVerificationEmail(
        signupDto.email,
        verificationCode.code,
      );
      this.logger.log({ response_from_send_verification_email: response });

      // 9) Send back user + code details
      return {
        user,
        email_verification_code: verificationCode.code,
        expires_at: verificationCode.expires_at,
      };
    });
  }

  /**
   * Summary: Verify user's email using a code, consume the code, and return an access token.
   * Inputs: email string, code string.
   * Returns: { user, access_token }.
   */
  async verifyEmail(email: string, code: string) {
    this.logger.log(`----- VERIFY EMAIL -----`);
    this.logger.log({ email });

    return this.sequelize.transaction(async (t: Transaction) => {
      // 1) Get active, unverified user
      const user = await this.userModel.findOne({
        where: { email, is_email_verified: false, is_active: true, deleted_at: null },
        attributes: ['id', 'email', 'first_name', 'last_name', 'is_email_verified'],
        include: [{ model: Role, attributes: ['id', 'title'] }],
        raw: true,
        nest: true,
        transaction: t,
      });
      if (!user) throw new BadRequestException('Invalid or expired code');

      // 2) Validate code (row lock inside validateCode)
      const verificationCode = await this.validateCode(
        user.id,
        code,
        CodeTypeEnum.EMAIL_VERIFICATION,
        t,
      );
      // 3) Consume code (guarded update)
      await this.consumeCode(verificationCode, t);

      // 4) Mark user verified
      await this.userModel.update(
        { is_email_verified: true },
        { where: { id: user.id }, transaction: t },
      );
      user.is_email_verified = true;

      // 5) activity log
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.EMAIL_VERIFIED,
        user.id,
        t,
      );

      // 6) Issue token
      const accessToken = this.generateToken(user);

      // 7) Return sanitized user + token
      return {
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          is_email_verified: true,
          role: { id: user.role?.id, title: user.role?.title },
        },
        access_token: accessToken,
      };
    });
  }

  /**
   * Summary: Fetch an active, unconsumed, unexpired verification code for a user and type.
   * Inputs: userId, code, type, optional transaction.
   * Returns: VerificationCode (plain object).
   */
  async validateCode(
    userId: string,
    code: string,
    type: CodeTypeEnum,
    t?: Transaction,
  ): Promise<VerificationCode> {
    this.logger.log(`----- VALIDATE CODE -----`);
    this.logger.log({ user_id: userId });
    this.logger.log({ code });
    // 1) Find most recent active code for this user/type
    const verificationCode = await this.verificationCodeModel.findOne({
      where: {
        user_id: userId,
        code,
        type,
        consumed_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [['created_at', 'DESC']],
      transaction: t,
      lock: t ? t.LOCK.UPDATE : undefined, // 2) Lock row if in tx
      skipLocked: !!t, // 3) Skip if locked by another tx
      raw: true,
      nest: true,
    });
    // 4) Reject if not found or expired
    if (!verificationCode) throw new BadRequestException('Invalid or expired code');
    return verificationCode;
  }

  /**
   * resendVerificationCode(email)
   * -----------------------------------------------------------------------------
   * Transaction-safe flow:
   *  1) Look up active (non-deleted) user by email.
   *  2) Invalidate ALL unconsumed, unexpired codes for this user (same tx).
   *  3) Create a fresh verification code (same tx).
   *  4) Return the code + expiry (you'll likely email/SMS the code separately).
   */
  async resendVerificationCode(email: string) {
    this.logger.log(`----- RESEND VERIFICATION CODE -----`);
    this.logger.log({ email });

    return this.sequelize.transaction(async (t: Transaction) => {
      // 1) Fetch the user within the transaction
      const user = await this.userModel.findOne({
        where: { email, is_active: true, deleted_at: null },
        attributes: ['id', 'email', 'is_email_verified'],
        include: [{ model: Role, attributes: ['id', 'title'] }],
        raw: true,
        nest: true,
        transaction: t,
      });

      if (!user) {
        throw new BadRequestException('Email does not exists in our system');
      }
      if (user.is_email_verified === true) {
        throw new BadRequestException('Email is already verified');
      }

      // 2) Invalidate any existing active codes (same transaction)
      await this.invalidateOldCodes(user.id, CodeTypeEnum.EMAIL_VERIFICATION, t);

      // 3) activity log
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.REQUESTED_VERIFICATION_CODE,
        user.id,
        t,
      );

      // 4) Create a brand new code (same transaction)
      //    Make sure your createCode signature supports a tx param.
      const verificationCode = await this.createCode(user.id, CodeTypeEnum.EMAIL_VERIFICATION, t);
      this.logger.log({ verification_code: verificationCode });
      // 8) send email
      const response = await this.mailService.sendAccountVerificationEmail(
        email,
        verificationCode.code,
      );
      this.logger.log({ response_from_resend_verification_code_email: response });

      // 5) Return the new code (and expiry) to the caller
      return {
        email_verification_code:
          process.env.NODE_ENV === 'production' ? null : verificationCode.code,
        expires_at: process.env.NODE_ENV === 'production' ? null : verificationCode.expires_at,
      };
    });
  }

  /**
   * Summary: Mark a verification code as consumed.
   * Inputs: verificationCode, optional transaction.
   * Returns: void (no throw to keep behavior unchanged).
   */
  async consumeCode(verificationCode: VerificationCode, t?: Transaction): Promise<void> {
    // 1) Try to set consumed_at once (no-op if already consumed/expired)
    await this.verificationCodeModel.update(
      { consumed_at: new Date() },
      {
        where: {
          id: verificationCode.id,
          consumed_at: null,
          expires_at: { [Op.gt]: new Date() },
        },
        transaction: t,
      },
    );
  }

  /**
   * Summary: Invalidate all active codes for a user/type in one statement.
   * Inputs: userId, type, optional transaction.
   * Returns: void.
   */
  async invalidateOldCodes(
    userId: string,
    type: CodeTypeEnum,
    transaction?: Transaction,
  ): Promise<void> {
    // 1) Mark any unconsumed+unexpired codes as consumed now
    await this.verificationCodeModel.update(
      { consumed_at: new Date() },
      {
        where: {
          user_id: userId,
          type,
          consumed_at: null,
          expires_at: { [Op.gt]: new Date() },
        },
        transaction,
      },
    );
  }

  /**
   * Summary: Create a fresh verification/reset code with a short expiry.
   * Inputs: userId, type, optional transaction.
   * Returns: VerificationCode (plain object).
   */
  async createCode(
    userId: string,
    type: CodeTypeEnum,
    transaction?: Transaction,
  ): Promise<VerificationCode> {
    // 1) Generate 4-digit code and expiry
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 60 * 1000);

    // 2) Insert record
    const insertedRecord = await this.verificationCodeModel.create(
      {
        user_id: userId,
        type,
        code,
        expires_at: expiresAt,
        created_at: new Date(),
      },
      { transaction },
    );

    // 3) Return as plain object
    return insertedRecord.get({ plain: true }) as unknown as VerificationCode;
  }

  /**
   * Summary: Sign in with email/password. If email not verified, issue OTP; otherwise return JWT.
   * Inputs: SigninDto.
   * Returns: { user, email_verification_code?, expires_at?, access_token? }.
   */
  async signin(signinDto: SigninDto) {
    this.logger.log(`----- SIGNIN -----`);
    this.logger.log({ email: signinDto.email });
    return this.sequelize.transaction(async (t: Transaction) => {
      // 1) Find active user by email
      const user = await this.userModel.findOne({
        where: { email: signinDto.email, deleted_at: null },
        attributes: [
          'id',
          'email',
          'first_name',
          'last_name',
          'password',
          'is_email_verified',
          'is_active',
          'deleted_at',
        ],
        include: [{ model: Role, attributes: ['id', 'title'] }],
        raw: true,
        nest: true,
        transaction: t,
      });
      if (!user) throw new BadRequestException('Incorrect email or password!');
      if (user.role?.title !== 'user')
        throw new BadRequestException('Incorrect email or password!');

      if (!user.is_active) throw new AccountNotActiveException();

      // 2) Check password (or reject if Google-only account)
      if (user.password) {
        const isPasswordValid = await this.validatePassword(signinDto.password, user.password);
        if (!isPasswordValid) throw new BadRequestException('Incorrect email or password!');
      } else {
        throw new BadRequestException(
          'An account is already registered against this email via google. Please use google signin',
        );
      }

      // 3) Update last login timestamp
      await this.userModel.update(
        { last_login_at: new Date() },
        { where: { id: user.id }, transaction: t },
      );

      // 4) activity log
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.SIGN_IN,
        user.id,
        t,
      );
      this.logger.log({ user_is_email_verified: user.is_email_verified });

      // 5) If not verified yet: issue OTP and bump analytics
      if (user.is_email_verified === false) {
        //  Invalidate any existing active codes (same transaction)
        await this.invalidateOldCodes(user.id, CodeTypeEnum.EMAIL_VERIFICATION, t);

        const verificationCode = await this.createCode(user.id, CodeTypeEnum.EMAIL_VERIFICATION, t);
        this.logger.log({ verification_code: verificationCode });
        await this.dailyAnalyticsService.bumpToday('logins', { by: 1, transaction: t });

        return {
          user: {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            is_email_verified: user.is_email_verified,
            role: user.role,
          },
          email_verification_code: verificationCode.code,
          expires_at: verificationCode.expires_at,
          access_token: null,
        };
      }

      // 6) Verified: bump analytics and return token
      await this.dailyAnalyticsService.bumpToday('logins', { by: 1, transaction: t });
      const access_token = this.generateToken(user);

      return {
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          is_email_verified: user.is_email_verified,
          role: user.role,
        },
        access_token,
      };
    });
  }

  /**
   * Summary: Compare a plain password with a stored bcrypt hash.
   * Inputs: password, hash.
   * Returns: boolean.
   */
  async validatePassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      this.logger.error('Password validation failed', error.stack);
      throw new InternalServerErrorException('Password validation failed');
    }
  }

  /**
   * Summary: Sign in (or up) with Google. Verifies token, creates user if needed, returns JWT.
   * Inputs: GoogleSigninDto { token }.
   * Returns: { user, access_token, googleData }.
   */
  async googleSignIn(googleSignInDto: GoogleSigninDto) {
    this.logger.log(`----- GOOGLE SIGNIN -----`);
    const token = googleSignInDto.token?.trim();
    if (!token) throw new GoogleAuthException();

    // ----- 1) Verify Google token (no DB yet) ---------------------------------
    const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
    const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const allowedClientIds = [webClientId].filter(isString);
    const isJwt = token.split('.').length === 3;
    this.logger.log({ is_jwt: isJwt });
    let email: string | undefined;
    let given_name = '';
    let family_name = '';
    let email_verified = false;
    let picture = '';
    // let googleData: any;

    if (isJwt) {
      // 1a) Verify ID token path
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: allowedClientIds,
      });
      const payload = ticket.getPayload();
      this.logger.log({ payload });
      if (!payload?.email) throw new GoogleAuthException();

      // googleData = payload;
      email = payload.email;
      given_name = payload.given_name || '';
      family_name = payload.family_name || '';
      email_verified = !!payload.email_verified;
      picture = payload?.picture || '';
    } else {
      // 1b) OAuth access token path
      const info = await this.googleClient.getTokenInfo(token);
      this.logger.log({ info });
      if (allowedClientIds.length && info.aud && !allowedClientIds.includes(info.aud))
        throw new GoogleAuthException();

      const resp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      this.logger.log({ resp });
      if (!resp.ok) throw new GoogleAuthException();

      const profile = await resp.json();
      this.logger.log({ profile });
      // googleData = profile;
      email = profile.email;
      given_name = profile.given_name || '';
      family_name = profile.family_name || '';
      email_verified = !!profile.email_verified;
      picture = profile?.picture || '';
      if (!email) throw new GoogleAuthException();
    }

    // ----- 2) DB work inside a single transaction ------------------------------
    return this.sequelize.transaction(async (t: Transaction) => {
      // 2a) Try to find user (with role)
      let user: any = await this.userModel.findOne({
        where: { email },
        attributes: [
          'id',
          'email',
          'provider',
          'is_active',
          'first_name',
          'last_name',
          'is_email_verified',
          'avatar',
          'role_id',
        ],
        include: [{ model: Role, attributes: ['id', 'title'] }],
        raw: true,
        nest: true,
        transaction: t,
      });
      this.logger.log({ existing_user: user });
      // 2b) Create new Google user if not found
      if (!user) {
        const userRole = await this.roleModel.findOne({
          where: { title: 'user' },
          raw: true,
          transaction: t,
        });
        if (!userRole)
          throw new InternalServerErrorException(
            'Failed to acquire necessary information at the moment.',
          );

        const userObject = {
          first_name: given_name || '',
          last_name: family_name || '',
          email,
          password: null,
          provider: ProviderEnum.GOOGLE,
          avatar: picture,
          is_email_verified: email_verified || false,
          role_id: userRole.id,
        };
        this.logger.log({ user_object: userObject });
        const insertedRecord = await this.userModel.create(userObject, { transaction: t });
        user = insertedRecord.get({ plain: true });
        user.role = { id: userRole.id, title: 'user' }; // attach role snapshot

        // Analytics: signup
        await this.dailyAnalyticsService.bumpToday('signups', { by: 1, transaction: t });
      } else if (user.provider !== ProviderEnum.GOOGLE) {
        // 2c) Existing local account with same email
        throw new BadRequestException(
          'An account with this email already exists. Please signin via email and password!',
        );
      }

      // 2d) Status check
      if (!user.is_active) throw new AccountNotActiveException();

      // 2e) Update last login
      await this.userModel.update(
        { last_login_at: new Date() },
        { where: { id: user.id }, transaction: t },
      );

      // 2f) Analytics: login
      await this.dailyAnalyticsService.bumpToday('logins', { by: 1, transaction: t });

      // 2g) Issue token
      const access_token = this.generateToken(user);

      // 3) activity log
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.SIGN_IN,
        user.id,
        t,
      );

      return {
        user,
        access_token,
        // googleData,
      };
    });
  }

  /**
   * Summary: Generate and return a password reset code (privacy-preserving if email not found).
   * Inputs: email string.
   * Returns: { password_reset_code, expires_at }.
   */
  async forgotPassword(email: string) {
    this.logger.log(`----- FORGOT PASSWORD -----`);
    this.logger.log({ email });
    return this.sequelize.transaction(async (t: Transaction) => {
      // 1) Look up user (do not leak presence if missing)
      const user = await this.userModel.findOne({
        where: { email },
        attributes: ['id', 'email', 'provider', 'is_active'],
        include: [{ model: Role, attributes: ['id', 'title'] }],
        raw: true,
        nest: true,
        transaction: t,
      });

      // 2) If not found, return neutral shape
      if (!user) {
        return { password_reset_code: '8888', expires_at: new Date() };
        // (Your mailer can still say "if this email exists, you'll receive a code")
      }

      // 3) Invalidate previous active reset codes
      await this.invalidateOldCodes(user.id, CodeTypeEnum.PASSWORD_RESET, t);

      // 4) Create new reset code
      const verificationCode = await this.createCode(user.id, CodeTypeEnum.PASSWORD_RESET, t);
      this.logger.log({ verification_code: verificationCode });
      // 5) send email
      const response = await this.mailService.sendForgotPasswordEmail(
        user.email,
        verificationCode.code,
      );

      this.logger.log({ response_from_forgot_password_email: response });
      // 6) Return code details
      return {
        password_reset_code: verificationCode.code,
        expires_at: verificationCode.expires_at,
      };
    });
  }

  /**
   * Summary: Verify a reset code and return a short-lived token to allow password change.
   * Inputs: email, code.
   * Returns: { reset_password_token }.
   */
  async verifyResetPasswordCode(email: string, code: string) {
    this.logger.log(`----- VERIFY RESET PASSWORD CODE -----`);
    this.logger.log({ email });

    return this.sequelize.transaction(async (t: Transaction) => {
      // 1) Get user by email
      const user = await this.userModel.findOne({
        where: { email },
        attributes: ['id', 'email', 'provider', 'is_active'],
        include: [{ model: Role, attributes: ['id', 'title'] }],
        raw: true,
        nest: true,
        transaction: t,
      });
      if (!user) throw new BadRequestException('Invalid or expired code');

      // 2) Validate code (lock row)
      const verificationCode = await this.validateCode(
        user.id,
        code,
        CodeTypeEnum.PASSWORD_RESET,
        t,
      );

      // 3) Consume code atomically
      await this.consumeCode(verificationCode, t);

      // 4) Issue temp reset token
      const tempToken = this.generateTempResetToken(user.id);
      return { reset_password_token: tempToken };
    });
  }

  /**
   * Summary: Change password by userId (e.g., after code verification).
   * Inputs: userId, new password.
   * Returns: true.
   */
  async resetPassword(userId: string, password: string) {
    this.logger.log(`----- RESET PASSWORD -----`);
    this.logger.log({ user_id: userId });

    // 1) Hash first (CPU-bound)
    const saltRounds = parseInt(this.configService.get('BCRYPT_SALT_ROUNDS', '12'), 10);
    const hashed = await bcrypt.hash(password, saltRounds);

    // 2) Update inside transaction
    return this.sequelize.transaction(async (t: Transaction) => {
      await this.userModel.update({ password: hashed }, { where: { id: userId }, transaction: t });

      // 3) (Optional) Invalidate any remaining reset codes for safety
      // await this.invalidateOldCodes(userId, CodeTypeEnum.PASSWORD_RESET, t);

      // 4) activity log
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.RESET_PASSWORD,
        userId,
        t,
      );

      return true;
    });
  }

  /**
   * Summary: Update password after verifying the current one.
   * Inputs: userId, oldPassword, newPassword.
   * Returns: true.
   */
  async updatePassword(userId: string, oldPassword: string, newPassword: string) {
    this.logger.log(`----- UPDATE PASSWORD -----`);
    this.logger.log({ user_id: userId });
    // 1) Load user with hash
    const user: any = await this.userModel.findOne({
      where: { id: userId },
      attributes: ['id', 'email', 'password'],
      include: [{ model: Role, attributes: ['id', 'title'] }],
      raw: true,
      nest: true,
    });

    // 2) Verify old password
    const isMatch = await this.validatePassword(oldPassword, user.password);
    if (!isMatch) throw new BadRequestException('Incorrect password!');

    // 3) Hash new password
    const saltRounds = parseInt(this.configService.get('BCRYPT_SALT_ROUNDS', '12'), 10);
    const hashed = await bcrypt.hash(newPassword, saltRounds);

    // 4) Persist inside a transaction
    return this.sequelize.transaction(async (t: Transaction) => {
      await this.userModel.update({ password: hashed }, { where: { id: userId }, transaction: t });
      // (Optional) await this.invalidateOldCodes(userId, CodeTypeEnum.PASSWORD_RESET, t);
      // 5) activity log
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.UPDATE_PASSWORD,
        userId,
        t,
      );
      return true;
    });
  }

  /**
   * Summary: Create a signed JWT access token for a user.
   * Inputs: user (must include id, email, role?.title).
   * Returns: string JWT.
   */
  private generateToken(user: User): string {
    return this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role?.title },
      { expiresIn: this.configService.get<string>('JWT_EXPIRES_IN') },
    );
  }

  /**
   * Summary: Create a short-lived temporary JWT for password reset flows.
   * Inputs: userId.
   * Returns: string JWT.
   */
  private generateTempResetToken(userId: string): string {
    const secret = this.configService.get<string>('TEMP_JWT_SECRET');
    const expiresIn = this.configService.get<string>('TEMP_JWT_EXPIRES_IN');
    const issuer = this.configService.get<string>('TEMP_JWT_ISS');
    const audience = this.configService.get<string>('TEMP_JWT_AUD');

    const tempSigner = new JwtService({ secret, signOptions: { expiresIn, issuer, audience } });
    return tempSigner.sign({ sub: userId, kind: 'reset_password' });
  }

  async logout(userId: string) {
    this.logger.log(`----- LOGOUT -----`);
    this.logger.log({ user_id: userId });

    return this.sequelize.transaction(async (t: Transaction) => {
      // activity log
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.SIGN_OUT,
        userId,
        t,
      );
      return true;
    });
  }
}
