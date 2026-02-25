import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/**
 * SearchUsersDto
 * ---------------
 * Purpose:
 * - Validate user search API query parameters.
 *
 * Summary:
 * - Query: required search string (name or email)
 * - Limit: max results to return (default: 20)
 * - Returns basic user info: id, first_name, last_name, email, gender, age
 */
export class SearchUsersDto {
  @ApiProperty({
    example: 'john',
    description: 'Search query for name or email',
  })
  @IsNotEmpty()
  @IsString()
  query: string;

  @ApiProperty({
    example: 20,
    description: 'Max results to return',
    required: false,
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
