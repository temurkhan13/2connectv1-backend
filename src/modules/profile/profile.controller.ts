import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  Res,
  HttpCode,
  UseInterceptors,
  BadRequestException,
  UploadedFile,
} from '@nestjs/common';
import * as multer from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import type { Response, Express } from 'express';
import { ProfileService } from 'src/modules/profile/profile.service';
import { AIServiceFacade } from 'src/integration/ai-service/ai-service.facade';
import { RESPONSES } from 'src/common/responses';
import { UpdateProfileDto, UpdateAvatarDto } from 'src/modules/profile/dto/profile.dto';
import { S3Service } from 'src/common/utils/s3.service';

/**
 * ProfileController
 * -----------------
 * Purpose:
 * - Expose profile-related endpoints: read profile, update profile, stream files,
 *   upload/update/delete avatar, and fetch latest summary.
 *
 * Summary:
 * - All endpoints require JWT via `AuthGuard('jwt')`.
 * - For uploads, uses `FileInterceptor` with in-memory buffer + basic mime/size checks.
 * - Delegates business logic and persistence to `ProfileService` and `S3Service`.
 * - Uses Swagger decorators for better API docs and examples.
 *
 */

// Allowed image types for avatar upload
const ALLOWED_MIME = new Set<string>(['image/jpeg', 'image/png']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

@ApiTags('Profile')
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly s3: S3Service,
    private readonly aiServiceFacade: AIServiceFacade,
  ) {}

  /**
   * Summary: Return the current user's profile details.
   * Inputs: JWT (req.user.id).
   * Returns: Profile object.
   */
  @Get('get-profile')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.myProfileSuccess.code,
    description: RESPONSES.myProfileSuccess.message,
    example: RESPONSES.myProfileSuccess,
  })
  async getProfileData(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const response = await this.profileService.getProfileData(userId);
    return response;
  }

  /**
   * Summary: Stream a file (by absolute S3 URL or proxy URL) to the client.
   * Inputs: url (query string).
   * Returns: Streams file content (inline).
   */
  @Get('stream-file')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async stream(@Query('url') url: string, @Res() res: Response) {
    if (!url) throw new BadRequestException('Missing url');
    await this.s3.streamToResponseByUrl(res, url, { inline: true });
  }

  /**
   * Summary: Update profile fields for the current user.
   * Inputs: JWT (req.user.id), UpdateProfileDto.
   * Returns: Success envelope + updated fields (as defined by service).
   */
  @Patch('update-profile')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.updateProfileSuccess.code,
    description: RESPONSES.updateProfileSuccess.message,
    example: RESPONSES.updateProfileSuccess,
  })
  async updateProfileData(
    @Request() req,
    @Body() dto: UpdateProfileDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const response = await this.profileService.updateProfileData(userId, dto);
    return response;
  }

  /**
   * Summary: Upload an avatar image and return its storage metadata (URL/key).
   * Inputs: JWT (req.user.id), multipart/form-data with `file`.
   * Returns: { url, key, size, contentType }.
   */
  @Post('upload-avatar')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      // 1) Keep file in memory buffer (simple + fast for small images)
      storage: multer.memoryStorage(),
      // 2) Enforce max size
      limits: { fileSize: MAX_BYTES },
      // 3) Accept only allowed MIME types
      fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          return cb(new BadRequestException('Only JPG, JPEG and PNG files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiBody({
    description: 'Upload avatar image. Returns a URL',
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Upload successful',
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          example: 'https://bucket.s3.ap-south-1.amazonaws.com/users/USER_ID/avatar/uuid.png',
        },
        key: { type: 'string', example: 'users/USER_ID/avatar/uuid.png' },
        size: { type: 'number', example: 234567 },
        contentType: { type: 'string', example: 'image/png' },
      },
    },
  })
  async uploadAvatar(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    // 1) Basic presence/size checks (defense-in-depth; multer already limits size)
    if (!file) throw new BadRequestException('File is required');
    if (file.size > MAX_BYTES) throw new BadRequestException('File too large (max 5 MB)');

    const userId = req?.user?.id as string | undefined;
    const response = await this.profileService.uploadAvatar(file, userId);
    return response;
  }

  /**
   * Summary: Update avatar metadata (e.g., set new URL or crop info).
   * Inputs: JWT (req.user.id), UpdateAvatarDto.
   * Returns: Success envelope.
   */
  @Patch('update-avatar')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.updateProfileSuccess.code,
    description: RESPONSES.updateProfileSuccess.message,
    example: RESPONSES.updateProfileSuccess,
  })
  async updateProfileAvatar(
    @Request() req,
    @Body() dto: UpdateAvatarDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const response = await this.profileService.updateProfileAvatar(userId, dto);
    return response;
  }

  /**
   * Summary: Delete the current user's avatar by URL.
   * Inputs: JWT (req.user.id), url (query string).
   * Returns: Success envelope.
   */
  @Delete('delete-avatar')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.deleteProfileAvatarSuccess.code,
    description: RESPONSES.deleteProfileAvatarSuccess.message,
    example: RESPONSES.deleteProfileAvatarSuccess,
  })
  async deleteProfileAvatar(
    @Request() req,
    @Query('url') url: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const response = await this.profileService.deleteProfileAvatar(url, userId);
    return response;
  }

  /**
   * Summary: Get the latest approved summary for the current user.
   * Inputs: JWT (req.user.id).
   * Returns: Summary object (shape defined by service).
   */
  /**
   * Update AI summary text and trigger re-matching.
   */
  @Patch('update-summary/:id')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async updateSummary(
    @Request() req,
    @Param('id') summaryId: string,
    @Body() body: { summary: string },
  ) {
    const userId = req.user.id;
    await this.profileService.updateSummary(userId, summaryId, body.summary);

    // Notify AI service to re-embed and re-match (fire-and-forget)
    this.aiServiceFacade.profileUpdated(userId).catch(err => {
      // Log but don't fail — summary save already succeeded
    });

    return { code: 200, message: 'Summary updated. Matches will refresh shortly.' };
  }

  @Get('get-summary')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.getLatestSummarySuccess.code,
    description: RESPONSES.getLatestSummarySuccess.message,
    example: RESPONSES.getLatestSummarySuccess,
  })
  async getSummary(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const response = await this.profileService.getSummary(userId);
    return response;
  }
}
