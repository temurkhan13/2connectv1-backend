/**
 * MessageTemplatesController
 * --------------------------
 * Purpose:
 * - Expose HTTP endpoints for creating, reading, and updating message templates.
 *
 * Summary:
 * - POST /message-templates/create: Create a message template for the current user.
 * - GET  /message-templates/get-single/:id: Get a single template by id (owned by current user).
 * - GET  /message-templates/get-all: Get all templates for the current user.
 * - PATCH /message-templates/update/:id: Update a template by id (owned by current user).
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Request,
  Res,
  HttpCode,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiResponse, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { MessageTemplatesService } from 'src/modules/message-templates/message-templates.service';
import { RESPONSES } from 'src/common/responses';
import {
  CreateMessageTemplatesDto,
  UpdateMessageTemplateDto,
} from 'src/modules/message-templates/dto/message-templates.dto';

@ApiTags('Message Templates')
@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly messageTemplatesService: MessageTemplatesService) {}

  /**
   * Create a new message template for the current user.
   * Input: JWT-authenticated user, CreateMessageTemplatesDto
   * Output: Created template payload (service response)
   */
  @Post('create')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a message template' })
  @ApiResponse({
    status: RESPONSES.messageTemplateCreateSuccess.code,
    description: RESPONSES.messageTemplateCreateSuccess.message,
    example: RESPONSES.messageTemplateCreateSuccess,
  })
  @ApiResponse({
    status: RESPONSES.messageTemplateCreateFailure.code,
    description: RESPONSES.messageTemplateCreateFailure.message,
    example: RESPONSES.messageTemplateCreateFailure,
  })
  async createMessageTemplate(
    @Request() req,
    @Body() dto: CreateMessageTemplatesDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const response = await this.messageTemplatesService.createMessageTemplate(userId, dto);
    return response;
  }

  /**
   * Get one template by id for the current user.
   * Input: JWT-authenticated user, :id (UUID v4)
   * Output: Template payload if found (service response)
   */
  @Get('get-single/:id')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one message template' })
  @ApiResponse({
    status: RESPONSES.messageTemplateGetSingleSuccess.code,
    description: RESPONSES.messageTemplateGetSingleSuccess.message,
    example: RESPONSES.messageTemplateGetSingleSuccess,
  })
  async getSingleMessageTemplate(
    @Request() req,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const response = await this.messageTemplatesService.getSingleMessageTemplate(userId, id);
    return response;
  }

  /**
   * Get all templates for the current user.
   * Input: JWT-authenticated user
   * Output: List of templates (service response)
   */
  @Get('get-all')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List message templates for current user' })
  @ApiResponse({
    status: RESPONSES.messageTemplateGetAllSuccess.code,
    description: RESPONSES.messageTemplateGetAllSuccess.message,
    example: RESPONSES.messageTemplateGetAllSuccess,
  })
  async getAllMessageTemplate(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const response = await this.messageTemplatesService.getAllMessageTemplate(userId);
    return response;
  }

  /**
   * Update a template by id for the current user.
   * Input: JWT-authenticated user, :id (UUID v4), UpdateMessageTemplateDto
   * Output: Updated template payload (service response)
   */
  @Patch('update/:id')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a message template' })
  @ApiResponse({
    status: RESPONSES.messageTemplateUpdateSuccess.code,
    description: RESPONSES.messageTemplateUpdateSuccess.message,
    example: RESPONSES.messageTemplateUpdateSuccess,
  })
  async updateMessageTemplate(
    @Request() req,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMessageTemplateDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const response = await this.messageTemplatesService.updateMessageTemplate(userId, dto, id);
    return response;
  }
}
