import { Sequelize } from 'sequelize-typescript';
import { Transaction, literal } from 'sequelize';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from 'src/common/entities/role.entity';
import { User } from 'src/common/entities/user.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { UpdateProfileDto, UpdateAvatarDto } from 'src/modules/profile/dto/profile.dto';
import { S3Service } from 'src/common/utils/s3.service';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { UserActivityLogsService } from 'src/modules/user-activity-logs/user-activity-logs.service';
import { UserActivityEventsEnum } from 'src/common/enums';
import { AIServiceFacade } from 'src/integration/ai-service/ai-service.facade';

/**
 * ProfileService
 * --------------
 * Purpose:
 * - Handle user profile operations for the 2Connect app.
 *
 * Summary:
 * - getProfileData: Read user profile with role and document link inside a read transaction.
 * - updateProfileData: Update profile fields in a DB transaction.
 * - updateProfileAvatar: Save avatar URL in a DB transaction.
 * - uploadAvatar: Upload an avatar to S3 (no DB work).
 * - deleteProfileAvatar: Null avatar in DB inside a transaction, then delete file from S3.
 * - getSummary: Read latest user summary inside a read transaction.
 */

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  constructor(
    @InjectModel(UserSummaries)
    private userSummaryModel: typeof UserSummaries,
    @InjectModel(User)
    private userModel: typeof User,
    private readonly s3: S3Service,
    private readonly userActivityLogsService: UserActivityLogsService,
    private readonly sequelize: Sequelize, // used for transactions
    private readonly aiServiceFacade: AIServiceFacade,
  ) {}

  /**
   * getProfileData
   * --------------
   * Input: userId (string)
   * Action: Read user, role, and document URL in a short read transaction.
   * Output: User object (without password) or 400 if not found.
   */
  async getProfileData(userId: string) {
    this.logger.log(`----- GET PROFILE DATA -----`);
    this.logger.log({ user_id: userId });

    return this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
      async t => {
        const user: any = await this.userModel.findOne({
          where: { id: userId },
          attributes: { exclude: ['password'] },
          include: [
            { model: Role, attributes: ['id', 'title'] },
            { model: UserDocument, attributes: ['url', 'title'] },
          ],
          raw: true,
          nest: true,
          transaction: t,
        });

        if (!user) {
          throw new BadRequestException('Something went worng. Try again in a few minutes');
        }
        return user;
      },
    );
  }

  /**
   * updateProfileData
   * -----------------
   * Input: userId (string), dto (UpdateProfileDto)
   * Action: Update user row inside a DB transaction.
   * Output: true on success.
   */
  async updateProfileData(userId: string, dto: UpdateProfileDto) {
    this.logger.log(`----- UPDATE PROFILE DATA -----`);
    this.logger.log({ user_id: userId });
    await this.sequelize.transaction(async t => {
      await this.userModel.update(dto, {
        where: { id: userId },
        transaction: t,
      });
      // activity log
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.UPDATE_PROFILE,
        userId,
        t,
      );
    });
    return true;
  }

  /**
   * updateProfileAvatar
   * -------------------
   * Input: userId (string), dto (UpdateAvatarDto)
   * Action: Set avatar URL inside a DB transaction.
   * Output: true on success.
   */
  async updateProfileAvatar(userId: string, dto: UpdateAvatarDto) {
    this.logger.log(`----- UPDATE PROFILE AVATAR -----`);
    this.logger.log({ user_id: userId });
    await this.sequelize.transaction(async t => {
      await this.userModel.update(
        { avatar: dto.url },
        {
          where: { id: userId },
          transaction: t,
        },
      );
    });
    return true;
  }

  /**
   * uploadAvatar
   * ------------
   * Input: file (Express.Multer.File), userId? (string)
   * Action: Upload to S3 and return file details (no DB transaction needed).
   * Output: { url, key, size, contentType } for uploaded file.
   */
  async uploadAvatar(file: Express.Multer.File, userId?: string) {
    this.logger.log(`----- UPLOAD AVATAR -----`);
    this.logger.log({ user_id: userId });
    const keyPrefix = userId
      ? `2connect/users/avatars/${userId}/`
      : `2connect/users/avatars/userId/`;

    const uploaded = await this.s3.uploadBuffer({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      keyPrefix,
    });

    return {
      url: uploaded.url,
      key: uploaded.key,
      size: file.size,
      contentType: file.mimetype,
    };
  }

  /**
   * deleteProfileAvatar
   * -------------------
   * Input: url (string), userId? (string)
   * Action:
   *   1) Inside a DB transaction: set avatar to null for the user.
   *   2) After commit: delete the file from S3 by URL.
   * Note:
   *   - S3 delete is outside DB transaction (external system).
   *   - If S3 delete throws, the DB change remains (avatar stays null).
   * Output: true on success (throws if S3 delete fails).
   */
  async deleteProfileAvatar(url: string, userId?: string) {
    this.logger.log(`----- DELETE PROFILE AVATAR -----`);
    this.logger.log({ user_id: userId });
    await this.sequelize.transaction(async t => {
      await this.userModel.update(
        { avatar: null },
        {
          where: { id: userId },
          transaction: t,
        },
      );
    });

    // external side-effect (cannot be rolled back by DB)
    await this.s3.deleteByUrl(url);
    return true;
  }

  /**
   * getSummary
   * ----------
   * Input: userId (string)
   * Action: Read latest summary (by created_at DESC) in a read transaction and JSON.parse it if found.
   * Output: Summary record with parsed summary, or null if none.
   */
  /**
   * updateSummary
   * -------------
   * Input: userId (string), summaryId (string), newSummary (string)
   * Action: Update summary text in DB, then notify AI service to re-embed + re-match.
   * Output: true on success.
   */
  async updateSummary(userId: string, summaryId: string, newSummary: string) {
    this.logger.log(`----- UPDATE SUMMARY -----`);
    this.logger.log({ user_id: userId, summary_id: summaryId });

    await this.sequelize.transaction(async t => {
      await this.userSummaryModel.update(
        { summary: newSummary },
        { where: { id: summaryId, user_id: userId }, transaction: t },
      );
    });

    // Notify AI service to re-embed + re-match with updated profile
    try {
      await this.aiServiceFacade.profileUpdated(userId);
      this.logger.log(`AI service notified of profile update for ${userId}`);
    } catch (error) {
      // Don't fail the update — re-matching is best-effort
      this.logger.warn(`Failed to notify AI service of profile update: ${error.message}`);
    }

    return true;
  }

  async getSummary(userId: string) {
    this.logger.log(`----- GET SUMMARY -----`);
    this.logger.log({ user_id: userId });
    return this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
      async t => {
        // May-04 fix: order approved-first, then version DESC, then created_at DESC.
        // Mirrors the AI service's defensive read in postgresql.py.get_latest_user_summary
        // (commit 020af91). After the May-04 webhook fix that stops backend from
        // writing duplicate v2 status='draft' rows, only one row should exist per
        // user (AI service's status='approved' direct write). But this ordering
        // ensures correct behavior even if legacy v2 rows exist OR if the AI
        // service writes a higher-version row in the future — approved always wins.
        //
        // Sequelize doesn't support CASE WHEN in `order` cleanly without raw
        // literal helpers, so we use Sequelize.literal for the conditional.
        const summaryRecord: any = await this.userSummaryModel.findOne({
          where: { user_id: userId },
          attributes: ['id', 'summary', 'status', 'version', 'webhook'],
          order: [
            [literal(`CASE WHEN status = 'approved' THEN 0 ELSE 1 END`), 'ASC'],
            ['version', 'DESC'],
            ['created_at', 'DESC'],
          ],
          raw: true,
          nest: true,
          transaction: t,
        });

        if (summaryRecord) {
          // BUG-007 FIX: Handle both JSON (old) and markdown (new) summaries
          // Try parsing as JSON first (backward compatibility), fallback to raw string (markdown)
          try {
            summaryRecord.summary = JSON.parse(summaryRecord.summary);
          } catch (e) {
            // Not JSON, assume it's markdown - leave as-is
            // Frontend expects string for MarkdownRenderer
            this.logger.log('Summary is not JSON, treating as markdown');
          }
        }
        return summaryRecord;
      },
    );
  }
}
