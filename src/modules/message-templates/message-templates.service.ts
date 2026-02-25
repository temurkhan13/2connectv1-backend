/**
 * MessageTemplatesService
 * -----------------------
 * Purpose:
 * - Manage create, read, and update operations for a user's message templates.
 *
 * Summary:
 * - createMessageTemplate: Enforce per-user limit, deactivate others, create one active template (TX).
 * - getSingleMessageTemplate: Read one template for the user (TX).
 * - getAllMessageTemplate: Read all templates for the user (TX).
 * - updateMessageTemplate: Update fields, enforce active rules, ensure only one active when needed (TX).
 */

import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/modules/user/user.service';
import { MessageTemplate } from 'src/common/entities/message-template.entity';
import {
  CreateMessageTemplatesDto,
  UpdateMessageTemplateDto,
} from 'src/modules/message-templates/dto/message-templates.dto';

@Injectable()
export class MessageTemplatesService {
  private readonly logger = new Logger(MessageTemplatesService.name);

  constructor(
    @InjectModel(MessageTemplate)
    private messageTemplateModel: typeof MessageTemplate,
    private readonly userService: UserService,
    private readonly sequelize: Sequelize,
    private readonly configService: ConfigService,
  ) {}

  /**
   * createMessageTemplate
   * ---------------------
   * Input: userId, dto
   * Action: Enforce limit, deactivate existing, create new active template (atomic).
   * Output: Plain created record.
   */
  async createMessageTemplate(userId: string, dto: CreateMessageTemplatesDto) {
    this.logger.log(`----- CREATE MESSAGE TEMPLATE -----`);
    this.logger.log({ user_id: userId });
    return this.sequelize.transaction(async (t: Transaction) => {
      // STEP 1: Read per-user limit from config.
      const limit = Number(this.configService.get('MESSAGE_TEMPLATES_LIMIT', 1));
      this.logger.log({ template_limit: limit });
      // STEP 2: Count existing templates for this user to enforce limit.
      const existingCount = await this.messageTemplateModel.count({
        where: { user_id: userId },
        transaction: t,
      });
      this.logger.log({ existing_count: existingCount });
      if (existingCount >= limit) {
        throw new BadRequestException('Maximum limit of message templates reached');
      }

      // STEP 3: Deactivate all current templates for this user.
      await this.messageTemplateModel.update(
        { is_active: false },
        { where: { user_id: userId }, transaction: t },
      );

      // STEP 4: Create the new template as active.
      const insertedRecord = await this.messageTemplateModel.create(
        {
          user_id: userId,
          title: dto.title,
          body: dto.body,
          is_active: true,
        },
        { transaction: t },
      );

      // STEP 5: Return a plain object (final state).
      return insertedRecord.get({ plain: true });
      // NOTE: Transaction commits if we reach here without throwing.
    });
  }

  /**
   * getSingleMessageTemplate
   * ------------------------
   * Input: userId, id
   * Action: Read single template for the user.
   * Output: Template (or null).
   */
  async getSingleMessageTemplate(userId: string, id: string) {
    this.logger.log(`----- GET SINGLE MESSAGE TEMPLATE -----`);
    this.logger.log({ user_id: userId });
    return this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
      async t => {
        // STEP 1: Find one template by id + user_id.
        const template: any = await this.messageTemplateModel.findOne({
          where: { id, user_id: userId },
          attributes: ['id', 'title', 'body', 'is_active'],
          raw: true,
          nest: true,
          transaction: t,
        });

        // STEP 2: Return the template (null if not found).
        return template;
        // NOTE: Transaction commits (read-only).
      },
    );
  }

  /**
   * getAllMessageTemplate
   * ---------------------
   * Input: userId
   * Action: Read all templates for the user.
   * Output: Array of templates.
   */
  async getAllMessageTemplate(userId: string) {
    this.logger.log(`----- GET ALL MESSAGE TEMPLATES -----`);
    this.logger.log({ user_id: userId });
    return this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
      async t => {
        // STEP 1: Find all templates for this user.
        const templates: any = await this.messageTemplateModel.findAll({
          where: { user_id: userId },
          attributes: ['id', 'title', 'body', 'is_active'],
          raw: true,
          nest: true,
          transaction: t,
        });

        // STEP 2: Return list.
        return templates;
        // NOTE: Transaction commits (read-only).
      },
    );
  }

  /**
   * updateMessageTemplate
   * ---------------------
   * Input: userId, dto, id
   * Action:
   *  - Lock current record
   *  - Enforce at least one active template
   *  - If activating this one, deactivate others for the same user
   *  - Update current record
   * Output: Plain updated record.
   */
  async updateMessageTemplate(userId: string, dto: UpdateMessageTemplateDto, id: string) {
    this.logger.log(`----- UPDATE MESSAGE TEMPLATE -----`);
    this.logger.log({ user_id: userId });
    return this.sequelize.transaction(async (t: Transaction) => {
      // STEP 1: Load and lock the target template for update.
      const template = await this.messageTemplateModel.findOne({
        where: { id, user_id: userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!template) {
        throw new NotFoundException('Message template not found');
      }

      // STEP 2: Count other active templates for this user.
      const otherActiveCount = await this.messageTemplateModel.count({
        where: { user_id: userId, is_active: true, id: { [Op.ne]: id } },
        transaction: t,
      });

      // STEP 3: Enforce "at least one active" rule.
      if (dto.is_active === false && otherActiveCount === 0) {
        throw new BadRequestException('At least one template must remain active.');
      }

      // STEP 4: Prepare fields to update (only provided fields).
      const updates: Partial<MessageTemplate> = { is_active: dto.is_active };
      if (dto.title !== undefined) updates.title = dto.title;
      if (dto.body !== undefined) updates.body = dto.body;

      // STEP 5: If activating this template, deactivate all others for this user.
      if (dto.is_active === true) {
        await this.messageTemplateModel.update(
          { is_active: false },
          { where: { user_id: userId, id: { [Op.ne]: id } }, transaction: t },
        );
      }

      // STEP 6: Persist updates to the current template.
      await template.update(updates, { transaction: t });

      // STEP 7: Return final state.
      return template.get({ plain: true });
      // NOTE: Transaction commits if we reach here without throwing.
    });
  }
}
