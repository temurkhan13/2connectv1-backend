import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean } from 'class-validator';

export class CreateMessageTemplatesDto {
  @ApiProperty({ example: 'title' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'body' })
  @IsNotEmpty()
  @IsString()
  body: string;
}

export class UpdateMessageTemplateDto {
  @ApiProperty({ example: 'title' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'body' })
  @IsNotEmpty()
  @IsString()
  body: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  is_active: boolean;
}
