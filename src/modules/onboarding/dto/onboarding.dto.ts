import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsDefined,
  isString,
  IsString,
  IsUUID,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// @ValidatorConstraint({ name: 'StringNumberOrObject', async: false })
// class StringNumberOrObject implements ValidatorConstraintInterface {
//   validate(value: any): boolean {
//     if (value === null || value === undefined) return false;
//     const t = typeof value;
//     return t === 'string' || t === 'number' || t === 'object'; // objects (incl. arrays) allowed
//   }
//   defaultMessage(): string {
//     return 'answer must be a string, number, or object';
//   }
// }

// export class AnswerItemDto {
//   @ApiProperty({ format: 'uuid', example: '890ed4e0-e61f-4461-94e6-4bafdda7bb18' })
//   @IsUUID('4')
//   question_id!: string;

//   @ApiProperty({
//     oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'object', additionalProperties: true }],
//     examples: ['male', 30, { resume: true, linkedIn: 'https://www.linkedin.com/in/xyz', bio: '…' }],
//   })
//   @IsDefined()
//   @Validate(StringNumberOrObject)
//   answer!: Record<string, any>;
// }

export class SubmitOnboardingQuestionDto {
  // @ApiProperty({ format: 'uuid', example: '33b5d0df-ede2-4f61-845d-c5f78c16e18c' })
  // @IsUUID('4')
  // section_id: string;

  @ApiProperty({ format: 'uuid', example: '33b5d0df-ede2-4f61-845d-c5f78c16e18c' })
  @IsUUID('4')
  question_id: string;

  @ApiProperty({ example: 'ai text' })
  @IsString()
  ai_text: string;

  @ApiProperty({ example: 'answer' })
  //@ApiProperty({ type: () => [AnswerItemDto] })
  @IsString()
  user_response: string;
}
