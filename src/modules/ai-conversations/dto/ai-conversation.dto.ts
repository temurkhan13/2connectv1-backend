// Purpose: Input shape for starting AI chat (MVP-safe, snake_case)

import { IsUUID, IsOptional, IsString, IsInt, Min, Max, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateAIChatDto {
  @ApiProperty({
    format: 'uuid',
    example: 'f0437514-3e82-4f95-8609-67b12f19b528',
    description: 'Match id for which AI chat will start',
  })
  @IsUUID()
  match_id!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'd4153cda-da08-46bb-bcab-cec206d29ea3',
    description: 'Responder user id (other user in the match)',
  })
  @IsUUID()
  responder_id!: string;

  @ApiPropertyOptional({
    example: 'icebreaker_v1',
    description: 'Optional template key to seed AI conversation style',
  })
  @IsOptional()
  @IsString()
  template?: string;
}

export class ListAIConversationsQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Page number (1-based)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Items per page (max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class GetAIConversationDetailQueryDto {
  @ApiProperty({
    format: 'uuid',
    example: 'c7e1b7d2-9eaa-4d00-90f1-4fd061c3f111',
    description: 'Conversation id to fetch',
  })
  @IsUUID()
  conversation_id!: string;

  @ApiPropertyOptional({ example: 1, description: 'Page number (1-based)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Items per page (max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class SubmitAiChatFeedbackDto {
  @ApiProperty({ example: 'feedback' })
  @IsNotEmpty()
  @IsString()
  feedback: string;

  @ApiProperty({ example: 'uuid' })
  @IsNotEmpty()
  @IsString()
  ai_chat_id: string;
}

export class TriggerUserToUserDto {
  @ApiProperty({ format: 'uuid', example: 'f0437514-3e82-4f95-8609-67b12f19b528' })
  @IsUUID()
  @IsNotEmpty()
  match_id: string;

  @ApiProperty({ format: 'uuid', example: 'd4153cda-da08-46bb-bcab-cec206d29ea3' })
  @IsUUID()
  @IsNotEmpty()
  responder_id: string;
}
