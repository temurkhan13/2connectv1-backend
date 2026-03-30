/**
 * VoiceController
 * ----------------
 * Accepts audio uploads from mobile app, forwards to AI service for
 * Whisper transcription, returns text. Audio is never stored.
 */

import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import * as multer from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { VoiceService } from './voice.service';

// Allowed audio MIME types
const ALLOWED_AUDIO_MIME = new Set<string>([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/aac',
  'audio/x-m4a',
  'audio/m4a',
]);

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB

@ApiTags('Voice')
@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('transcribe')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Audio file (webm, mp4, mp3, wav, ogg, m4a)' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_AUDIO_BYTES },
      fileFilter: (req, file, cb) => {
        if (!ALLOWED_AUDIO_MIME.has(file.mimetype)) {
          return cb(new BadRequestException('Unsupported audio format. Supported: webm, mp4, mp3, wav, ogg, m4a'), false);
        }
        cb(null, true);
      },
    }),
  )
  async transcribe(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Audio file is required');
    if (file.size > MAX_AUDIO_BYTES) throw new BadRequestException('Audio file too large (max 25MB)');

    return this.voiceService.transcribe(file);
  }
}
