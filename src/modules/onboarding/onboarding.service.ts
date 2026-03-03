/**
 * OnBoardingService
 * -------------------------------------------------------------
 * Purpose:
 * - Manage onboarding questions, answers, resume uploads.
 * - Drive AI summary request/approval flows.
 *
 * Summary:
 * - Read ops are plain queries.
 * - All write ops run inside Sequelize transactions for atomicity.
 * - Where external I/O happens (S3, HTTP), DB writes still stay ACID.
 */

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { OnboardingSection } from 'src/common/entities/onboarding-section.entity';
import { OnboardingQuestion } from 'src/common/entities/onboarding-question.entity';
import { UserOnboardingAnswer } from 'src/common/entities/user-onboarding-answer.entity';
import { User } from 'src/common/entities/user.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { SubmitOnboardingQuestionDto } from 'src/modules/onboarding/dto/onboarding.dto';
import { S3Service } from 'src/common/utils/s3.service';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { dobFromAge } from 'src/common/utils/dob.util';
import { UserActivityLogsService } from 'src/modules/user-activity-logs/user-activity-logs.service';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';
import { OnboardingStatusEnum, SummaryStatusEnum, UserActivityEventsEnum } from 'src/common/enums';
import { AIServiceFacade } from 'src/integration/ai-service/ai-service.facade';
import { onboarding_questions } from 'src/common/constants';

@Injectable()
export class OnBoardingService {
  private readonly logger = new Logger(OnBoardingService.name);
  constructor(
    @InjectModel(UserDocument)
    private userDocumentModel: typeof UserDocument,

    @InjectModel(OnboardingSection)
    private onboardingSectionModel: typeof OnboardingSection,

    private readonly userActivityLogsService: UserActivityLogsService,
    private readonly dailyAnalyticsService: DailyAnalyticsService,
    @InjectModel(UserSummaries)
    private userSummaryModel: typeof UserSummaries,

    @InjectModel(OnboardingQuestion)
    private onboardingQuestionModel: typeof OnboardingQuestion,

    @InjectModel(UserOnboardingAnswer)
    private userOnboardingAnswerModel: typeof UserOnboardingAnswer,

    @InjectModel(User)
    private readonly userModel: typeof User,

    private readonly s3: S3Service,

    private readonly sequelize: Sequelize,

    private readonly aiService: AIServiceFacade,
  ) {}

  /**
   * Normalize suggestion_chips value
   */
  normalizeSuggestionChips(value: any) {
    if (!value) return undefined;

    // Remove wrapping quotes if stringified
    if (typeof value === 'string') {
      return value.replace(/^"(.*)"$/, '$1');
    }

    // If JSON object stored as string, ignore for MVP
    return undefined;
  }

  // ------------------------------------------------------------
  // HELPER METHODS (Extracted to reduce duplication)
  // ------------------------------------------------------------

  /**
   * Build AI modify question payload and call AI service.
   * Extracted from 7+ duplicate blocks in getNextOnboardingQuestion.
   *
   * @param question - The onboarding question to enhance with AI
   * @param formattedUserResponses - Previous user responses for context
   * @returns The question with AI-enhanced text and suggestion chips
   */
  private async enhanceQuestionWithAI(question: any, formattedUserResponses: any[]): Promise<any> {
    if (!question) {
      this.logger.warn('enhanceQuestionWithAI called with null question');
      return null;
    }

    const modifyQuestionPayload = {
      previous_user_response: formattedUserResponses,
      question_id: question.id,
      code: question.code,
      prompt: question.prompt,
      description: question.description,
      narration: question.narration,
      suggestion_chips: question.suggestion_chips ?? '',
      options: question.options,
    };

    try {
      const aiResponse: any = await this.aiService.modifyQuestionText(modifyQuestionPayload);
      question.ai_text = aiResponse?.ai_text ?? '';
      question.suggestion_chips = aiResponse?.suggestion_chips ?? question.suggestion_chips;
    } catch (error) {
      this.logger.error(`AI enhancement failed for question ${question.id}: ${error.message}`);
      // Fallback: use original prompt as ai_text
      question.ai_text = question.prompt ?? '';
    }

    return question;
  }

  /**
   * Safely access nested question branches with null checks.
   * Prevents null pointer exceptions when accessing:
   * existingPrimaryGoalResponse.onboarding_question.nested_question.branches[user_response]
   *
   * @param primaryGoalResponse - The primary goal response object
   * @returns Array of nested questions or empty array if not found
   */
  private getNestedQuestionsFromBranch(primaryGoalResponse: any): any[] {
    if (!primaryGoalResponse) return [];

    const onboardingQuestion = primaryGoalResponse.onboarding_question;
    if (!onboardingQuestion) {
      this.logger.warn('Primary goal response missing onboarding_question');
      return [];
    }

    const nestedQuestion = onboardingQuestion.nested_question;
    if (!nestedQuestion) {
      this.logger.warn('Primary goal question missing nested_question');
      return [];
    }

    const branches = nestedQuestion.branches;
    if (!branches || typeof branches !== 'object') {
      this.logger.warn('Primary goal question missing branches');
      return [];
    }

    const userResponse = primaryGoalResponse.user_response;
    if (!userResponse) {
      this.logger.warn('Primary goal response missing user_response');
      return [];
    }

    const branchQuestions = branches[userResponse];
    if (!Array.isArray(branchQuestions)) {
      this.logger.warn(`No branch found for user_response: ${userResponse}`);
      return [];
    }

    return branchQuestions;
  }

  /**
   * Find the next question in sequence based on display order.
   *
   * @param lastDisplayOrder - The display order of the last answered question
   * @param t - Transaction object
   * @returns The next question or null if no more questions
   */
  private async findNextQuestionByOrder(lastDisplayOrder: number, t: Transaction): Promise<any> {
    return this.onboardingQuestionModel.findOne({
      where: {
        is_active: true,
        display_order: { [Op.gt]: lastDisplayOrder },
      },
      order: [['display_order', 'ASC']],
      raw: true,
      nest: true,
      transaction: t,
    });
  }

  /**
   * Get the user's last submitted response by display order.
   *
   * @param userId - The user ID
   * @param t - Transaction object
   * @returns The last submitted response or null
   */
  private async getLastSubmittedResponse(userId: string, t: Transaction): Promise<any> {
    return this.userOnboardingAnswerModel.findOne({
      where: { user_id: userId },
      order: [['display_order', 'DESC']],
      transaction: t,
    });
  }

  /**
   * Check if user has already answered a specific question.
   *
   * @param userId - The user ID
   * @param questionCode - The question code to check
   * @param t - Transaction object
   * @returns The existing response or null
   */
  private async getUserResponseByCode(
    userId: string,
    questionCode: string | undefined,
    t: Transaction,
  ): Promise<any> {
    if (!questionCode) return null;

    return this.userOnboardingAnswerModel.findOne({
      where: {
        user_id: userId,
        code: questionCode,
      },
      transaction: t,
      raw: true,
      nest: true,
    });
  }

  /**
   * Transform raw onboarding answers into API response format
   */
  formatOnboardingAnswers(rawAnswers: any[]) {
    if (!Array.isArray(rawAnswers)) return [];

    return rawAnswers.map(item => ({
      question_id: item.id, // use question id
      ai_text: item.ai_text ?? '', // fallback safe
      prompt: item.prompt,
      description: item.description ?? '',
      narration: item.narration ?? '',
      suggestion_chips: item.suggestion_chips ?? '',
      options: Array.isArray(item.options)
        ? item.options.map((opt: any) => ({
            label: opt.label,
            value: opt.value,
          }))
        : null,
      user_response: item.user_response,
    }));
  }
  // ------------------------------------------------------------
  // getNextOnboardingQuestion (REFACTORED)
  // Broken down from 257 lines into smaller, testable methods.
  // ------------------------------------------------------------

  /**
   * Main entry point for getting the next onboarding question.
   * Delegates to specialized handlers based on user's progress.
   */
  async getNextOnboardingQuestion(userId: string) {
    this.logger.log(`----- GET ONBOARDING QUESTION -----`);
    this.logger.log({ user_id: userId });

    return this.sequelize.transaction(async (t: Transaction) => {
      // Get user's previous responses for AI context
      const userResponses = await this.getOnboardingAnswersData(userId);
      const formattedUserResponses = this.formatOnboardingAnswers(userResponses);

      // Check if user has answered the primary goal question
      const existingPrimaryGoalResponse = await this.getPrimaryGoalResponse(userId, t);

      if (existingPrimaryGoalResponse) {
        return this.handlePrimaryGoalFlow(
          userId,
          existingPrimaryGoalResponse,
          formattedUserResponses,
          t,
        );
      } else {
        return this.handleDefaultFlow(userId, formattedUserResponses, t);
      }
    });
  }

  /**
   * Get user's primary goal response if it exists.
   */
  private async getPrimaryGoalResponse(userId: string, t: Transaction): Promise<any> {
    return this.userOnboardingAnswerModel.findOne({
      where: { user_id: userId },
      include: [
        {
          model: OnboardingQuestion,
          as: 'onboarding_question',
          where: { code: 'primary_goal' },
        },
      ],
      transaction: t,
      raw: true,
      nest: true,
    });
  }

  /**
   * Handle question flow when user has already answered primary goal.
   * This involves navigating through nested/branch questions.
   */
  private async handlePrimaryGoalFlow(
    userId: string,
    primaryGoalResponse: any,
    formattedUserResponses: any[],
    t: Transaction,
  ): Promise<any> {
    // Safely get nested questions with null checks
    const nestedQuestions = this.getNestedQuestionsFromBranch(primaryGoalResponse);

    if (nestedQuestions.length === 0) {
      this.logger.warn('No nested questions found for primary goal, falling back to default flow');
      return this.handleDefaultFlow(userId, formattedUserResponses, t);
    }

    // Check which nested questions are already answered
    const answeredNestedResponses = await this.userOnboardingAnswerModel.findAll({
      where: {
        user_id: userId,
        code: { [Op.in]: nestedQuestions.map((q: any) => q.code) },
      },
      order: [['display_order', 'ASC']],
      transaction: t,
    });

    // Determine if all nested questions are answered
    const allNestedAnswered = answeredNestedResponses.length >= nestedQuestions.length;

    if (allNestedAnswered) {
      return this.handlePostNestedFlow(userId, primaryGoalResponse, formattedUserResponses, t);
    }

    // Get the next unanswered nested question
    const nextNestedCode = nestedQuestions[answeredNestedResponses.length]?.code;
    if (!nextNestedCode) {
      this.logger.warn('Could not determine next nested question code');
      return this.handleDefaultFlow(userId, formattedUserResponses, t);
    }

    const nextQuestion = await this.onboardingQuestionModel.findOne({
      where: { is_active: true, code: nextNestedCode },
      raw: true,
      nest: true,
      transaction: t,
    });

    if (!nextQuestion) {
      this.logger.warn(`Nested question not found for code: ${nextNestedCode}`);
      return null;
    }

    return this.enhanceQuestionWithAI(nextQuestion, formattedUserResponses);
  }

  /**
   * Handle flow after all nested questions are answered.
   * Proceeds to the next main question after primary goal family.
   */
  private async handlePostNestedFlow(
    userId: string,
    primaryGoalResponse: any,
    formattedUserResponses: any[],
    t: Transaction,
  ): Promise<any> {
    // Get next question after primary goal by display order
    let nextQuestion = await this.onboardingQuestionModel.findOne({
      where: {
        is_active: true,
        display_order: primaryGoalResponse.display_order + 1,
      },
      raw: true,
      nest: true,
      transaction: t,
    });

    if (!nextQuestion) {
      return null;
    }

    // Check if this question is already answered
    const existingAnswer = await this.getUserResponseByCode(userId, nextQuestion.code, t);

    if (existingAnswer) {
      // Find the most recent answer and get the next question after it
      const lastResponse = await this.getLastSubmittedResponse(userId, t);
      if (!lastResponse) {
        return null;
      }

      nextQuestion = await this.findNextQuestionByOrder(lastResponse.display_order, t);
      if (!nextQuestion) {
        return null;
      }
    }

    return this.enhanceQuestionWithAI(nextQuestion, formattedUserResponses);
  }

  /**
   * Handle default flow when user hasn't answered primary goal yet.
   * Simply proceeds through questions by display order.
   */
  private async handleDefaultFlow(
    userId: string,
    formattedUserResponses: any[],
    t: Transaction,
  ): Promise<any> {
    const lastResponse = await this.getLastSubmittedResponse(userId, t);

    if (!lastResponse) {
      // No answers yet - return the first question
      const firstQuestion = await this.onboardingQuestionModel.findOne({
        where: { is_active: true },
        order: [['display_order', 'ASC']],
        raw: true,
        nest: true,
        transaction: t,
      });

      if (!firstQuestion) {
        this.logger.warn('No active questions found');
        return null;
      }

      return this.enhanceQuestionWithAI(firstQuestion, formattedUserResponses);
    }

    // Find next question after last answered
    let nextQuestion = await this.findNextQuestionByOrder(lastResponse.display_order, t);

    if (!nextQuestion) {
      return null;
    }

    // Handle display order gap detection (for nested questions)
    const orderDiff = nextQuestion.display_order - lastResponse.display_order;

    // Constants for nested question detection (previously magic numbers)
    const NESTED_QUESTION_MIN_GAP = 0.001;
    const NESTED_QUESTION_MAX_GAP = 0.011;

    if (orderDiff >= NESTED_QUESTION_MIN_GAP && orderDiff <= NESTED_QUESTION_MAX_GAP) {
      // This is a nested question - return it directly
      return this.enhanceQuestionWithAI(nextQuestion, formattedUserResponses);
    }

    if (orderDiff === 1) {
      // Next main question - return it
      return this.enhanceQuestionWithAI(nextQuestion, formattedUserResponses);
    }

    // Gap is larger than expected - find next available question
    nextQuestion = await this.onboardingQuestionModel.findOne({
      where: {
        is_active: true,
        display_order: { [Op.gte]: Math.ceil(lastResponse.display_order) },
      },
      order: [['display_order', 'ASC']],
      raw: true,
      nest: true,
      transaction: t,
    });

    if (!nextQuestion) {
      return null;
    }

    return this.enhanceQuestionWithAI(nextQuestion, formattedUserResponses);
  }

  // ------------------------------------------------------------
  // uploadResume
  // Summary: upload resume to S3, then upsert UserDocument.url in a single TX.
  // Steps:
  //  1) Upload buffer to S3 (I/O).
  //  2) TX: if doc exists -> update url; else -> create row.
  // Return: basic file metadata.
  // ------------------------------------------------------------
  async uploadResume(file: Express.Multer.File, userId?: string) {
    this.logger.log(`----- UPLOAD RESUME -----`);
    this.logger.log({ user_id: userId });
    const keyPrefix = userId
      ? `2connect/users/resumes/${userId}/`
      : `2connect/users/resumes/userId/`;

    // External I/O (not transactional). DB writes below are kept ACID.
    const uploaded = await this.s3.uploadBuffer({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      keyPrefix,
    });

    await this.sequelize.transaction(async (t: Transaction) => {
      const savedResume = await this.userDocumentModel.findOne({
        where: { user_id: userId },
        attributes: ['id', 'url'],
        transaction: t,
        raw: true,
        nest: true,
      });
      this.logger.log({ existing_resume: savedResume });
      if (savedResume?.id) {
        await this.userDocumentModel.update(
          { url: uploaded.url, title: file.originalname },
          { where: { id: savedResume.id }, transaction: t },
        );
      } else {
        await this.userDocumentModel.create(
          { user_id: userId, type: 'resume', url: uploaded.url, title: file.originalname },
          { transaction: t },
        );
      }
    });

    return {
      url: uploaded.url,
      key: uploaded.key,
      size: file.size,
      contentType: file.mimetype,
    };
  }

  /**
   * submitOnboardingQuestion
   */
  async submitOnboardingQuestion(userId: string, dto: SubmitOnboardingQuestionDto) {
    this.logger.log(`----- SUBMIT ONBOARDING QUESTION -----`);
    this.logger.log({ user_id: userId });
    let userResponse: any;
    const userInputResponse = dto.user_response;

    // All writes in a single transaction
    return this.sequelize.transaction(async (t: Transaction) => {
      const existingResponse = await this.userOnboardingAnswerModel.findOne({
        where: {
          user_id: userId,
          question_id: dto.question_id,
        },
        transaction: t,
      });
      if (existingResponse) throw new BadRequestException('This question is already submitted');

      // Bootstrap onboarding status if needed
      const user = await this.userModel.findOne({
        where: { id: userId },
        attributes: ['id', 'onboarding_status'],
        transaction: t,
        raw: true,
      });

      const userUpdatePayload: any = {};

      if (user?.onboarding_status === 'not_started') {
        userUpdatePayload.onboarding_status = 'in_progress';
      }

      const onboardingQuestion: any = await this.onboardingQuestionModel.findOne({
        where: { id: dto.question_id },
        attributes: ['id', 'code', 'display_order', 'options', 'input_type'],
        transaction: t,
        raw: true,
      });

      // gender
      if (onboardingQuestion.code === 'gender')
        userUpdatePayload.gender = userResponse ?? dto.user_response.toLowerCase();

      // Age → DOB
      if (onboardingQuestion.code === 'age') {
        userUpdatePayload.date_of_birth = dobFromAge(dto.user_response);
        if (!userUpdatePayload.date_of_birth) {
          const nextQuestion = await this.getNextOnboardingQuestion(userId);
          nextQuestion.ai_text =
            'It looks like that the age you just provided does not sound right. We would appreciate if you could provide us a valid age. It will help us get the best results for you.';
          return {
            user_response: userResponse ?? dto.user_response,
            user_input_response: userInputResponse,
            fallback: true,
            nextQuestion,
          };
        }
      }

      // Bio
      if (onboardingQuestion.code === 'resume_linkedin_bio') {
        const isObject: boolean = await this.isTheValueAnObject(userResponse ?? dto.user_response);
        if (isObject) {
          const bio = JSON.parse(userResponse ?? dto.user_response)?.bio ?? null;
          const linkedIn = JSON.parse(userResponse ?? dto.user_response)?.linkedIn ?? null;
          if (bio) userUpdatePayload.bio = bio;
          if (linkedIn) userUpdatePayload.linkedin_profile = linkedIn;
        }
      } else {
        if (
          onboardingQuestion.options &&
          onboardingQuestion.input_type === 'single_select' &&
          Array.isArray(onboardingQuestion.options) &&
          onboardingQuestion.options.length > 0
        ) {
          const paramsForPrediction = {
            options: onboardingQuestion.options,
            user_response: dto.user_response,
          };
          const aiResponse: any = await this.aiService.predictAnswer(paramsForPrediction);
          if (aiResponse.valid_answer) {
            userResponse =
              onboardingQuestion.code === 'gender'
                ? aiResponse.predicted_answer.toLowerCase()
                : aiResponse.predicted_answer;
          } else {
            const nextQuestion = await this.getNextOnboardingQuestion(userId);
            nextQuestion.ai_text = aiResponse.fallback_text;
            return {
              user_response: userResponse ?? dto.user_response,
              user_input_response: userInputResponse,
              fallback: true,
              nextQuestion,
            };
          }
        }
      }

      // objective
      if (onboardingQuestion.code === 'primary_goal')
        userUpdatePayload.objective = userResponse ?? dto.user_response;

      // Create the answer row
      await this.userOnboardingAnswerModel.create(
        {
          user_id: userId,
          question_id: dto.question_id,
          prompt: dto.ai_text,
          user_response: userResponse ?? dto.user_response,
          user_input_response: userInputResponse,
          display_order: onboardingQuestion.display_order,
          code: onboardingQuestion.code,
        },
        { transaction: t },
      );
      // Activity log: onboarding submission
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.ONBOARDING_SUBMISSION,
        userId,
        t,
      );

      const progress: any = await this.getOnboardingProgress(userId);
      if (progress.meta.totalQuestions - progress.meta.answeredQuestions === 1) {
        await this.userActivityLogsService.insertActivityLog(
          UserActivityEventsEnum.ONBOARDING_COMPLETED,
          userId,
          t,
        );
        userUpdatePayload.onboarding_status = 'completed';
      }

      // Persist user updates in a single UPDATE if any fields collected
      if (Object.keys(userUpdatePayload).length > 0) {
        if (userUpdatePayload.gender) {
          userUpdatePayload.gender = userResponse ?? dto.user_response;
        }

        await this.userModel.update(userUpdatePayload, { where: { id: userId }, transaction: t });
      }

      return progress.meta.totalQuestions - progress.meta.answeredQuestions === 1
        ? {
            onboarding_status: 'completed' as const,
            user_response: userResponse ?? dto.user_response,
            user_input_response: userInputResponse,
            fallback: false,
          }
        : {
            onboarding_status: 'in_progress' as const,
            user_response: userResponse ?? dto.user_response,
            user_input_response: userInputResponse,
            fallback: false,
          };
    });
  }

  async getUserResponseByQuestionId(userId: string, questionId: string) {
    this.logger.log(`----- GET USER RESPONSE BY QUESTION ID -----`);
    this.logger.log({ user_id: userId });

    // All writes in a single transaction
    return this.sequelize.transaction(async (t: Transaction) => {
      const existingRecord = await this.userOnboardingAnswerModel.findOne({
        where: {
          user_id: userId,
          question_id: questionId,
        },
        attributes: ['id'],
        transaction: t,
      });
      if (!existingRecord) throw new BadRequestException('question not found');

      return existingRecord.id;
    });
  }

  /**
   * updateOnboardingQuestion
   * ------------------------------------------------------------
   */
  async updateOnboardingQuestion(userId: string, dto: SubmitOnboardingQuestionDto) {
    this.logger.log(`----- UPDATE ONBOARDING QUESTION -----`);
    this.logger.log({ user_id: userId });
    let userResponse: any;
    const userInputResponse = dto.user_response;

    return await this.sequelize.transaction(async (t: Transaction) => {
      // Must exist to update
      const existingResponse = await this.userOnboardingAnswerModel.findOne({
        where: { user_id: userId, question_id: dto.question_id },
        transaction: t,
      });
      if (!existingResponse) throw new BadRequestException('question is not submitted');

      // User updates (DOB, bio, linkedin, gender) in a single UPDATE if present
      const userUpdatePayload: any = {};

      const onboardingQuestion: any = await this.onboardingQuestionModel.findOne({
        where: { id: dto.question_id },
        attributes: ['id', 'code', 'display_order', 'options', 'input_type'],
        transaction: t,
        raw: true,
      });

      // gender
      if (onboardingQuestion.code === 'gender')
        userUpdatePayload.gender = dto.user_response.toLowerCase();

      // Age → DOB
      if (onboardingQuestion.code === 'age') {
        userUpdatePayload.date_of_birth = dobFromAge(dto.user_response);
        if (!userUpdatePayload.date_of_birth) {
          const nextQuestion = await this.getNextOnboardingQuestion(userId);
          if (!nextQuestion) {
            // recall this question again
            const nextPossibleQuestion: any = await this.onboardingQuestionModel.findOne({
              where: { is_active: true, id: onboardingQuestion.id },
              order: [['display_order', 'ASC']],
              raw: true,
              nest: true,
              transaction: t,
            });
            const modifyQuestionPayload: any = {
              previous_user_response: [],
              question_id: nextPossibleQuestion.id,
              code: nextPossibleQuestion.code,
              prompt: nextPossibleQuestion.prompt,
              description: nextPossibleQuestion.description,
              narration: nextPossibleQuestion.narration,
              suggestion_chips: nextPossibleQuestion.suggestion_chips ?? '',
              options: nextPossibleQuestion.options,
            };
            const aiResponse: any = await this.aiService.modifyQuestionText(modifyQuestionPayload);
            nextPossibleQuestion.ai_text = aiResponse.ai_text;
            nextPossibleQuestion.suggestion_chips = aiResponse.suggestion_chips;
            nextPossibleQuestion.ai_text = aiResponse.fallback_text;
            return {
              user_response: userResponse ?? dto.user_response,
              user_input_response: userInputResponse,
              fallback: true,
              nextQuestion: nextPossibleQuestion,
            };
          }
          nextQuestion.ai_text =
            'It looks like that the age you just provided does not sound right. We would appreciate if you could provide us a valid age. It will help us get the best results for you.';
          return {
            user_response: userResponse ?? dto.user_response,
            user_input_response: userInputResponse,
            fallback: true,
            nextQuestion,
          };
        }
      }

      // Bio

      if (onboardingQuestion.code === 'resume_linkedin_bio') {
        const isObject: boolean = await this.isTheValueAnObject(userResponse ?? dto.user_response);
        if (isObject) {
          const bio = JSON.parse(userResponse ?? dto.user_response)?.bio ?? null;
          const linkedIn = JSON.parse(userResponse ?? dto.user_response)?.linkedIn ?? null;
          if (bio) userUpdatePayload.bio = bio;
          if (linkedIn) userUpdatePayload.linkedin_profile = linkedIn;
        }
      } else {
        if (
          onboardingQuestion.options &&
          onboardingQuestion.input_type === 'single_select' &&
          Array.isArray(onboardingQuestion.options) &&
          onboardingQuestion.options.length > 0
        ) {
          const paramsForPrediction = {
            options: onboardingQuestion.options,
            user_response: dto.user_response,
          };
          const aiResponse: any = await this.aiService.predictAnswer(paramsForPrediction);
          if (aiResponse.valid_answer) {
            userResponse =
              onboardingQuestion.code === 'gender'
                ? aiResponse.predicted_answer.toLowerCase()
                : aiResponse.predicted_answer;
          } else {
            const nextPossibleQuestion: any = await this.onboardingQuestionModel.findOne({
              where: { is_active: true, id: onboardingQuestion.id },
              order: [['display_order', 'ASC']],
              raw: true,
              nest: true,
              transaction: t,
            });
            nextPossibleQuestion.ai_text = aiResponse.fallback_text;
            return {
              fallback: true,
              nextQuestion: nextPossibleQuestion,
              user_response: userResponse ?? dto.user_response,
              user_input_response: userInputResponse,
            };
          }
        }
      }

      // objective
      if (onboardingQuestion.code === 'primary_goal') {
        userUpdatePayload.objective = userResponse ?? dto.user_response;
        // force whole number
        const sortOrder = Math.floor(Number(onboardingQuestion.display_order));

        // safe upper bound
        const nextOrder = sortOrder + 1;
        await this.userOnboardingAnswerModel.destroy({
          where: {
            user_id: userId,
            display_order: {
              [Op.gt]: sortOrder,
              [Op.lt]: nextOrder,
            },
          },
          transaction: t,
        });

        await this.userModel.update(
          { onboarding_status: OnboardingStatusEnum.IN_PROGRESS },
          { where: { id: userId }, transaction: t },
        );
      }
      // Log activity first (still inside TX)
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.ONBOARDING_UPDATE,
        userId,
        t,
      );

      // Apply updates
      await this.userOnboardingAnswerModel.update(
        {
          user_response: userResponse ?? dto.user_response,
          user_input_response: userInputResponse,
        },
        { where: { id: existingResponse.id }, transaction: t },
      );

      if (Object.keys(userUpdatePayload).length > 0) {
        if (userUpdatePayload.gender) {
          userUpdatePayload.gender = userResponse ?? dto.user_response;
        }
        await this.userModel.update(userUpdatePayload, { where: { id: userId }, transaction: t });
      }
      return {
        user_response: userResponse ?? dto.user_response,
        user_input_response: userInputResponse,
        fallback: false,
      };
    });
  }

  // ------------------------------------------------------------
  // resetOnboardingData
  // Summary: delete all answers for a user.
  // TX Scope: single destroy where user_id=userId.
  // ------------------------------------------------------------
  async resetOnboardingData(userId: string) {
    this.logger.log(`----- RESET ONBOARDING DATA -----`);
    this.logger.log({ user_id: userId });
    await this.sequelize.transaction(async (t: Transaction) => {
      await this.userOnboardingAnswerModel.destroy({ where: { user_id: userId }, transaction: t });
      await this.userModel.update(
        { onboarding_status: OnboardingStatusEnum.NOT_STARTED },
        { where: { id: userId }, transaction: t },
      );
      // activity log
      await this.userActivityLogsService.insertActivityLog(
        UserActivityEventsEnum.ONBOARDING_RESET,
        userId,
        t,
      );
    });

    return true;
  }

  // getOnboardingProgress
  // ------------------------------------------------------------
  async getOnboardingProgress(userId: string) {
    this.logger.log('----- GET ONBOARDING PROGRESS -----');
    this.logger.log({ user_id: userId });

    /**
     * Helper: safe percent calculation.
     */
    const toPercent = (answered: number, total: number) => {
      if (!total || total <= 0) return 0;
      const p = (answered / total) * 100;
      // Keep it clean, optional: round to 2 decimals
      return Math.min(100, Math.max(0, Number(p.toFixed(2))));
    };

    /**
     * 1) Fetch sections and their questions.
     *    Tip: If you only want active/required questions, add proper where clauses.
     */
    const sections = await this.onboardingSectionModel.findAll({
      attributes: ['id', 'code', 'title'],
      include: [
        {
          model: OnboardingQuestion,
          as: 'questions',
          required: false,
          attributes: ['id', 'code', 'is_required', 'nested_question'],
        },
      ],
      order: [['display_order', 'ASC']],
    });

    /**
     * 2) Count "base" questions (all sections except core_objectives)
     *    and also find the primary_goal question.
     */
    let totalQuestions = 0;
    let primaryGoalQuestion: any | null = null;

    for (const sec of sections) {
      const questions = Array.isArray(sec.questions) ? sec.questions : [];

      if (sec.code !== 'core_objectives') {
        // If you want only required questions, replace with:
        // totalQuestions += questions.filter(q => q.is_required).length;
        totalQuestions += questions.length;
        continue;
      }

      // core_objectives: find the question that drives branches
      primaryGoalQuestion = questions.find(q => q.code === 'primary_goal') || null;
    }

    /**
     * If primary goal question is missing, we cannot calculate dynamic part.
     * Return progress based on base questions only.
     */
    if (!primaryGoalQuestion?.id) {
      // Count answered questions (distinct question_id) for this user
      const answeredQuestions = await this.userOnboardingAnswerModel.count({
        where: { user_id: userId },
        distinct: true,
        col: 'question_id',
      });

      return { progress: toPercent(answeredQuestions, totalQuestions) };
    }

    /**
     * 3) Read user's answer for primary_goal.
     */
    const primaryGoalAnswer = await this.userOnboardingAnswerModel.findOne({
      where: { user_id: userId, question_id: primaryGoalQuestion.id },
      raw: true,
    });

    /**
     * 4) Add dynamic question count for core_objectives.
     *    - If not answered, use fallback (your current rule).
     *    - If answered, add (1 + branch questions length).
     */
    if (!primaryGoalAnswer) {
      // Your fallback rule: core_objectives totals to 4 questions if not answered yet.
      totalQuestions += 4;
    } else {
      const userResponse = (primaryGoalAnswer as any)?.user_response;

      const branches = primaryGoalQuestion?.nested_question?.branches;

      // Always count the primary_goal question itself as part of total
      totalQuestions += 1;

      if (branches && typeof branches === 'object' && typeof userResponse === 'string') {
        const branchItems = branches[userResponse];
        if (Array.isArray(branchItems)) {
          totalQuestions += branchItems.length;
        }
      }
    }

    /**
     * 5) Count answered questions for this user.
     *    Use distinct question_id to be safe.
     */
    const answeredQuestions = await this.userOnboardingAnswerModel.count({
      where: { user_id: userId },
      distinct: true,
      col: 'question_id',
    });

    /**
     * 6) Return percentage.
     */
    const progress = toPercent(answeredQuestions, totalQuestions);

    return {
      progress,
      meta: {
        answeredQuestions,
        totalQuestions,
        hasPrimaryGoalAnswer: Boolean(primaryGoalAnswer),
      },
    };
  }

  // ------------------------------------------------------------
  // getOnboardingAnswersData
  // Summary: returns enriched answers grouped by section with question metadata.
  // Steps:
  //  1) load all answer rows for user
  //  3) map + sort by display_order
  // ------------------------------------------------------------
  async getOnboardingAnswersData(userId: string) {
    this.logger.log(`----- GET ONBOARDING ANSWERS DATA -----`);
    this.logger.log({ user_id: userId });
    const rows = await this.userOnboardingAnswerModel.findAll({
      where: { user_id: userId },
      include: [
        {
          model: OnboardingQuestion,
          as: 'onboarding_question',
          where: { is_active: true },
          include: [
            {
              model: OnboardingSection,
              as: 'onboarding_section',
              attributes: ['code'],
              where: { is_active: true },
            },
          ],
        },
      ],
      order: [['display_order', 'ASC']],
      raw: true,
      nest: true,
    });
    if (!rows.length) return [];
    return this.transformOnboardingAnswers(rows);
  }

  async getOnboardingAnswersDataForAISummary(userId: string) {
    this.logger.log(`----- GET ONBOARDING ANSWERS DATA -----`);
    this.logger.log({ user_id: userId });
    const rows = await this.userOnboardingAnswerModel.findAll({
      where: { user_id: userId },
      include: [
        {
          model: OnboardingQuestion,
          as: 'onboarding_question',
          where: { is_active: true },
        },
      ],
      order: [['display_order', 'ASC']],
      raw: true,
      nest: true,
    });
    if (!rows.length) return [];
    return rows;
  }

  /**
   * Transform onboarding answer rows into
   * question-centric response with user answer merged
   */
  transformOnboardingAnswers(rows: any[]) {
    return rows.map(row => {
      const q = row.onboarding_question;

      return {
        id: q.id,
        section_id: q.section_id,
        answer_id: row.id,
        code: q.code,
        section_code: q.onboarding_section.code,
        prompt: q.prompt,
        narration: q.narration,
        description: q.description,
        input_type: q.input_type,
        comma_separated: q.comma_separated,
        options: q.options,
        suggestion_chips: q.suggestion_chips,
        is_required: q.is_required,
        display_order: q.display_order,
        is_active: q.is_active,
        has_nested_question: q.has_nested_question,
        nested_question: q.nested_question,
        ai_text: row.prompt,
        user_response: row.user_response,
        user_input_response: row.user_input_response,
        is_answer_accepted: true,
        created_at: q.created_at,
        updated_at: q.updated_at,
      };
    });
  }

  /**
   * Check if a string value is a valid JSON object or array.
   * FIX: Now actually validates JSON instead of just checking first character.
   *
   * @param value - The string to check
   * @returns true if value is valid JSON object/array, false otherwise
   */
  async isTheValueAnObject(value?: string | null): Promise<boolean> {
    if (!value) return false;

    const trimmed = value.trim();
    if (!trimmed) return false;

    // Fast check: JSON must start with { or [
    const firstChar = trimmed.charAt(0);
    if (firstChar !== '{' && firstChar !== '[') {
      return false; // plain string
    }

    // Actually validate JSON to prevent crashes on malformed input
    try {
      const parsed = JSON.parse(trimmed);
      // Ensure it's actually an object or array (not null, number, etc.)
      return typeof parsed === 'object' && parsed !== null;
    } catch (error) {
      // Invalid JSON - log for debugging
      this.logger.warn(`Invalid JSON detected: ${trimmed.substring(0, 50)}...`);
      return false;
    }
  }

  // ------------------------------------------------------------
  // requestAiSummary
  async requestAiSummary(userId: string) {
    this.logger.log(`----- REQUEST AI SUMMARY -----`);
    this.logger.log({ user_id: userId });
    // 0) Enforce weekly per-user limit before any heavy work
    await this.assertWeeklySummaryLimit(userId);

    const answerData = await this.getOnboardingAnswersDataForAISummary(userId);
    if (!answerData) throw new BadRequestException('Answer data not found');

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http';
    if (!aiServiceUrl) {
      throw new InternalServerErrorException('AI service URL not configured');
    }

    let resumeLink: any = '';
    const questions: any[] = [];

    // build payload from enriched answers
    for (const q of answerData as any[]) {
      const isObject: boolean = await this.isTheValueAnObject(q.user_response);
      if (isObject) resumeLink = JSON.parse(q.user_response)?.resume;
      questions.push({ prompt: q.onboarding_question.prompt, answer: q.user_response }); // fixed "amnswer" -> "answer"
    }

    try {
      const latest: any = await this.userSummaryModel.findOne({
        where: { user_id: userId },
        attributes: ['id', 'version', 'webhook'],
        order: [['version', 'DESC']],
        raw: true,
      });
      this.logger.log({ latest_summary: latest });
      const params = {
        user_id: userId,
        update: latest ? true : false,
        resume_link: resumeLink?.url ?? resumeLink,
        questions,
      };
      this.logger.log({ params_for_ai_endpoint: params });
      const resp = await axios.post(
        `${aiServiceUrl}/user/register`,
        params, // <- body
        {
          headers: {
            'X-Api-Key': process.env.AI_SERVICE_API_KEY!, // header name per spec
            // 'Content-Type' is auto-set for objects, no need to set
          },
          timeout: 60_000, // AI summary generation can take 30+ seconds with OpenAI
        },
      );
      this.logger.log({ response_from_ai_service_request_ai_summary: resp.data });
      await this.sequelize.transaction(async (t: Transaction) => {
        // daily analytics entry
        await this.dailyAnalyticsService.bumpToday('summaries_created', { by: 1, transaction: t });
        // activity log
        await this.userActivityLogsService.insertActivityLog(
          UserActivityEventsEnum.AI_SUMMARY_REQUESTED,
          userId,
          t,
        );

        //update summary webhook to false
        if (latest) {
          await this.userSummaryModel.update(
            { webhook: false },
            { where: { id: latest.id }, transaction: t },
          );
        }
      });

      return params; //resp.data;
    } catch (error: any) {
      throw new InternalServerErrorException(`Failed to fetch AI summary: ${error.message}`);
    }
  }

  /**
   * assertWeeklySummaryLimit
   * ------------------------
   * Purpose:
   * - Enforce max number of AI summary/persona requests per user per week.
   *
   * Rules:
   * - PERSONAS_PER_WEEK env defines max allowed per rolling 7 days.
   * - We count records in user_summaries for this user within last 7 days.
   * - If count >= limit => throw BadRequest (or 429 if you prefer).
   */
  private async assertWeeklySummaryLimit(userId: string): Promise<void> {
    // 1) Read limit from env, fallback to 5 if not set or invalid
    const limitFromEnv = Number(process.env.PERSONAS_PER_WEEK);
    const weeklyLimit = Number.isFinite(limitFromEnv) && limitFromEnv > 0 ? limitFromEnv + 1 : 5;
    this.logger.log({ weekly_limit: weeklyLimit });
    // 2) Define "week window" as last 7 days from now
    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);

    // 3) Count how many summaries this user has created in that window
    const usedThisWeek = await this.userSummaryModel.count({
      where: {
        user_id: userId,
        created_at: {
          [Op.gte]: weekAgo, // created_at >= weekAgo
        },
      },
    });
    this.logger.log({ summary_limit_used_this_week: usedThisWeek });
    this.logger.log({ user_id: userId });
    // 4) If quota reached, block the request
    if (usedThisWeek >= weeklyLimit) {
      throw new BadRequestException(
        `You have reached your weekly limit of ${weeklyLimit} AI summaries. Please try again later.`,
      );
    }
  }

  // ------------------------------------------------------------
  // approveAiSummary
  // Summary: tell AI to approve a summary then request persona creation.
  // Steps:
  //  1) GET approve-summary with userId, summaryId
  //  2) POST request-persona with userId
  // TX: external calls only; daily analytics increment can be added inside a TX if needed.
  // ------------------------------------------------------------
  async approveAiSummary(userId: string, summaryId: string) {
    this.logger.log('------- APPROVE AI SUMMARY ----------');
    this.logger.log({ timestamp: new Date(Date.now()) });
    this.logger.log({ user_id: userId });
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http';
    if (!aiServiceUrl) {
      throw new InternalServerErrorException('AI service URL not configured');
    }

    const user = await this.userModel.findOne({
      where: { id: userId },
      attributes: ['id', 'onboarding_status', 'has_requested_matches'],
      raw: true,
    });
    this.logger.log({ user });
    try {
      if (user && !user.has_requested_matches) {
        const resp = await axios.post(
          `${aiServiceUrl}/user/approve-summary`,
          { user_id: userId }, // <- body
          {
            headers: {
              'X-Api-Key': process.env.AI_SERVICE_API_KEY!, // header name per spec
              // 'Content-Type' is auto-set for objects, no need to set
            },
            timeout: 60_000, // AI summary approval can take 30+ seconds with OpenAI
          },
        );
        this.logger.log({ response_from_ai_service_approve_ai_summary: resp.data });
      }

      await this.sequelize.transaction(async (t: Transaction) => {
        // daily analytics entry
        await this.dailyAnalyticsService.bumpToday('personas_created', { by: 1, transaction: t });
        // activity log (Persona updated)
        await this.userActivityLogsService.insertActivityLog(
          UserActivityEventsEnum.AI_SUMMARY_APPROVED,
          userId,
          t,
        );
        await this.userSummaryModel.update(
          { status: SummaryStatusEnum.APPROVED },
          { where: { id: summaryId }, transaction: t },
        );

        await this.userModel.update(
          { has_requested_matches: true },
          { where: { id: userId }, transaction: t },
        );
      });
      // daily_analytics increment could go here inside a TX if required
      return true;
    } catch (error: any) {
      throw new InternalServerErrorException(`Failed to approve AI summary: ${error.message}`);
    }
  }

  async script(options: any) {
    const batchSize = options?.batchSize ?? 20000;
    const deleteOldRows = options?.deleteOldRows ?? true;
    const validateQuestionIds = options?.validateQuestionIds ?? false;
    const dryRun = options?.dryRun ?? false;

    this.logger.log('----- BACKFILL user_onboarding_answer START -----');
    this.logger.log({ batchSize, deleteOldRows, validateQuestionIds, dryRun });

    let processedOldRows = 0;
    let createdNewRows = 0;
    let skippedOldRows = 0;

    const oldRows = await this.userOnboardingAnswerModel.findAll({
      where: {
        section_id: { [Op.ne]: null },
        question_id: { [Op.is]: null },
      },
      order: [['created_at', 'ASC']],
    });

    await this.sequelize.transaction(async (t: Transaction) => {
      for (const q of onboarding_questions) {
        await this.onboardingQuestionModel.update(
          { display_order: q.display_order },
          { where: { code: q.code }, transaction: t },
        );
      }

      for (const oldRow of oldRows) {
        const rawAnswer = oldRow.answer;

        let arr: any[] = [];
        try {
          arr = Array.isArray(rawAnswer)
            ? rawAnswer
            : typeof rawAnswer === 'string'
            ? JSON.parse(rawAnswer)
            : [];
        } catch (e) {
          arr = [];
        }

        if (!Array.isArray(arr) || arr.length === 0) {
          skippedOldRows++;
          return;
        }

        const questionIds: string[] = arr
          .map(x => x?.question_id)
          .filter(Boolean)
          .map((x: any) => String(x));

        if (!questionIds.length) {
          skippedOldRows++;
          return;
        }

        const questionRows = await this.onboardingQuestionModel.findAll({
          where: { id: { [Op.in]: questionIds } },
          attributes: ['id', 'prompt', 'display_order', 'code'],
          transaction: t,
          raw: true,
        });

        const qMap = new Map<
          string,
          { prompt: string | null; display_order: number | null; code: string | null }
        >();

        for (const q of questionRows) {
          qMap.set(String(q.id), {
            prompt: q.prompt ?? null,
            display_order:
              q.display_order === undefined || q.display_order === null
                ? null
                : Number(q.display_order),
            code: q.code ?? null,
          });
        }

        const allowedQuestionIdSet = validateQuestionIds ? new Set(Array.from(qMap.keys())) : null;

        const inserts = arr
          .map(item => {
            const qid = item?.question_id ? String(item.question_id) : null;
            if (!qid) return null;

            if (allowedQuestionIdSet && !allowedQuestionIdSet.has(qid)) {
              return null;
            }

            const qMeta = qMap.get(qid);

            const value = item?.answer?.value;

            let userResponse: string | null = null;
            if (value === undefined || value === null) {
              userResponse = null;
            } else if (typeof value === 'object') {
              userResponse = JSON.stringify(value);
            } else {
              userResponse = String(value);
            }

            return {
              user_id: oldRow.user_id,
              section_id: oldRow.section_id,
              question_id: qid,
              user_response: userResponse,
              user_input_response: userResponse,
              prompt: qMeta?.prompt ?? null,
              display_order: qMeta?.display_order ?? null,
              code: qMeta?.code ?? null,
              answer: null,
            };
          })
          .filter(Boolean);

        if (!inserts.length) {
          skippedOldRows++;
          return;
        }

        if (!dryRun) {
          await this.userOnboardingAnswerModel.bulkCreate(inserts as any[], {
            transaction: t,
            validate: false,
          });

          if (deleteOldRows) {
            await this.userOnboardingAnswerModel.destroy({
              where: { id: oldRow.id },
              transaction: t,
            });
          }
        }

        processedOldRows++;
        createdNewRows += inserts.length;

        this.logger.log({
          old_row_id: oldRow.id,
          user_id: oldRow.user_id,
          section_id: oldRow.section_id,
          created_new_rows: inserts.length,
          dryRun,
        });
      }
    });

    this.logger.log('----- BACKFILL user_onboarding_answer DONE -----');

    return {
      processedOldRows,
      createdNewRows,
      skippedOldRows,
    };
  }

  // ==========================================
  // Conversational Onboarding Methods
  // Dynamic Slot-Filling, Multi-Turn Context, Progressive Disclosure
  // ==========================================

  /**
   * Start Conversational Onboarding Session
   * ----------------------------------------
   * Initiates a new chat-based onboarding session with the AI service.
   * This replaces the fixed-question flow with a dynamic conversation.
   *
   * @param userId - The user's ID
   * @param objective - Optional user objective (fundraising, hiring, etc.)
   * @returns OnboardingStartResponse with session_id, greeting, suggested_questions
   */
  async startConversationalOnboarding(userId: string, objective?: string) {
    this.logger.log(`----- START CONVERSATIONAL ONBOARDING -----`);
    this.logger.log({ user_id: userId, objective });

    try {
      // Update user status and log activity in transaction
      await this.sequelize.transaction(async (t: Transaction) => {
        await this.userModel.update(
          { onboarding_status: OnboardingStatusEnum.IN_PROGRESS },
          { where: { id: userId }, transaction: t },
        );

        await this.userActivityLogsService.insertActivityLog(
          UserActivityEventsEnum.ONBOARDING_SUBMISSION,
          userId,
          t,
        );
      });

      // Call AI service to start session
      const response = await this.aiService.startOnboardingSession({
        user_id: userId,
        objective,
      });

      return response;
    } catch (error: any) {
      this.logger.error(`Failed to start conversational onboarding: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to start conversational onboarding: ${error.message}`,
      );
    }
  }

  /**
   * Conversational Onboarding Chat
   * ------------------------------
   * Sends a chat message and receives AI response with extracted slots.
   * The AI extracts structured data (name, industry, goals, etc.) from freeform text.
   *
   * @param userId - The user's ID
   * @param message - User's chat message
   * @param sessionId - Optional session ID (creates new if not provided)
   * @returns OnboardingChatResponse with ai_response, extracted_slots, completion_percent
   */
  async conversationalOnboardingChat(userId: string, message: string, sessionId?: string) {
    this.logger.log(`----- CONVERSATIONAL ONBOARDING CHAT -----`);
    this.logger.log({ user_id: userId, session_id: sessionId, message_length: message.length });

    try {
      // Call AI service
      const response = await this.aiService.onboardingChat({
        user_id: userId,
        message,
        session_id: sessionId,
      });

      // If onboarding is complete, update user status
      if (response.is_complete) {
        await this.sequelize.transaction(async (t: Transaction) => {
          await this.userModel.update(
            { onboarding_status: OnboardingStatusEnum.COMPLETED },
            { where: { id: userId }, transaction: t },
          );

          await this.userActivityLogsService.insertActivityLog(
            UserActivityEventsEnum.ONBOARDING_COMPLETED,
            userId,
            t,
          );
        });
      }

      return response;
    } catch (error: any) {
      this.logger.error(`Failed to process conversational chat: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to process conversational chat: ${error.message}`,
      );
    }
  }

  /**
   * Get Conversational Onboarding Progress
   * --------------------------------------
   * Retrieves progress for a conversational onboarding session.
   *
   * @param sessionId - The session ID
   * @returns OnboardingProgressResponse with progress_percent, slots_filled, etc.
   */
  async getConversationalOnboardingProgress(sessionId: string) {
    this.logger.log(`----- GET CONVERSATIONAL ONBOARDING PROGRESS -----`);
    this.logger.log({ session_id: sessionId });

    try {
      return await this.aiService.getOnboardingProgress(sessionId);
    } catch (error: any) {
      this.logger.error(`Failed to get conversational progress: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to get conversational progress: ${error.message}`,
      );
    }
  }

  /**
   * Finalize Conversational Onboarding
   * ----------------------------------
   * Finalizes the session and returns all collected data.
   *
   * @param sessionId - The session ID
   * @returns OnboardingFinalizeResponse with collected_data
   */
  async finalizeConversationalOnboarding(sessionId: string) {
    this.logger.log(`----- FINALIZE CONVERSATIONAL ONBOARDING -----`);
    this.logger.log({ session_id: sessionId });

    try {
      return await this.aiService.finalizeOnboarding(sessionId);
    } catch (error: any) {
      this.logger.error(
        `Failed to finalize conversational onboarding: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to finalize conversational onboarding: ${error.message}`,
      );
    }
  }

  /**
   * Complete Conversational Onboarding
   * ----------------------------------
   * Completes onboarding and triggers profile/persona creation.
   * This is the final step after all slots are filled.
   *
   * @param userId - The user's ID
   * @param sessionId - The session ID
   * @returns OnboardingCompleteResponse with profile_created status
   */
  async completeConversationalOnboarding(userId: string, sessionId: string) {
    this.logger.log(`----- COMPLETE CONVERSATIONAL ONBOARDING -----`);
    this.logger.log({ user_id: userId, session_id: sessionId });

    try {
      // Call AI service to complete and create profile/persona
      const response = await this.aiService.completeOnboarding({
        user_id: userId,
        session_id: sessionId,
      });

      // Update user status
      await this.sequelize.transaction(async (t: Transaction) => {
        await this.userModel.update(
          {
            onboarding_status: OnboardingStatusEnum.COMPLETED,
            has_requested_matches: true,
          },
          { where: { id: userId }, transaction: t },
        );

        await this.userActivityLogsService.insertActivityLog(
          UserActivityEventsEnum.ONBOARDING_COMPLETED,
          userId,
          t,
        );

        // Log persona creation
        if (response.profile_created) {
          await this.userActivityLogsService.insertActivityLog(
            UserActivityEventsEnum.AI_SUMMARY_APPROVED,
            userId,
            t,
          );

          await this.dailyAnalyticsService.bumpToday('personas_created', { by: 1, transaction: t });
        }
      });

      return response;
    } catch (error: any) {
      this.logger.error(
        `Failed to complete conversational onboarding: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to complete conversational onboarding: ${error.message}`,
      );
    }
  }
}
