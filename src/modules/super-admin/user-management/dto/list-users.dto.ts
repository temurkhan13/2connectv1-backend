import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  UserSortFieldEnum,
  SortOrderEnum,
  AccountStatusEnum,
  OnboardingStatusFilterEnum,
  GenderFilterEnum,
} from 'src/common/utils/constants/user-management.constant';

/**
 * ListUsersDto
 * -----------
 * Purpose:
 * - Validate user listing API query parameters with pagination and filters.
 *
 * Summary:
 * - Page: current page number (default: 1)
 * - Limit: results per page (default: 20, max: 100)
 * - Sort: field to sort by (default: created_at)
 * - Order: sort order (default: DESC)
 * - Search: optional text search on name and email
 * - Onboarding status filter: optional
 * - Account status filter: optional
 * - Gender filter: optional
 */
export class ListUsersDto {
  @ApiProperty({
    example: 1,
    description: 'Page number starting from 1. Each page contains up to limit results.',
    required: false,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    example: 20,
    description: 'Results per page. Default: 20, Maximum: 100.',
    required: false,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({
    enum: UserSortFieldEnum,
    description:
      'Field to sort by. Options: created_at (creation date), updated_at (modification date), first_name, last_name, email, age',
    required: false,
    default: UserSortFieldEnum.CREATED_AT,
    example: UserSortFieldEnum.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(UserSortFieldEnum)
  sort?: UserSortFieldEnum = UserSortFieldEnum.CREATED_AT;

  @ApiProperty({
    enum: SortOrderEnum,
    description:
      'Sort direction. ASC (ascending/alphabetical/oldest first) or DESC (descending/reverse/newest first)',
    required: false,
    default: SortOrderEnum.DESC,
    example: SortOrderEnum.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrderEnum)
  order?: SortOrderEnum = SortOrderEnum.DESC;

  @ApiProperty({
    example: 'john',
    description:
      'Search term to find users by name or email (case-insensitive, partial matches supported)',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    enum: OnboardingStatusFilterEnum,
    description:
      'Filter by onboarding progress. not_started (user has not begun), in_progress (user is completing), completed (all steps done)',
    required: false,
    example: OnboardingStatusFilterEnum.COMPLETED,
  })
  @IsOptional()
  @IsEnum(OnboardingStatusFilterEnum)
  onboarding_status?: OnboardingStatusFilterEnum;

  @ApiProperty({
    enum: AccountStatusEnum,
    description:
      'Filter by account status. active (user account is enabled), inactive (user account is disabled)',
    required: false,
    example: AccountStatusEnum.ACTIVE,
  })
  @IsOptional()
  @IsEnum(AccountStatusEnum)
  account_status?: AccountStatusEnum;

  @ApiProperty({
    enum: GenderFilterEnum,
    description: 'Filter by gender',
    required: false,
    example: GenderFilterEnum.MALE,
  })
  @IsOptional()
  @IsEnum(GenderFilterEnum)
  gender?: GenderFilterEnum;
}
