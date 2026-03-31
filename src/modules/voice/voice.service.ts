/**
 * VoiceService
 * -------------
 * Forwards audio to AI service /voice/transcribe endpoint.
 * Audio is sent as multipart/form-data and never stored.
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import FormData = require('form-data');

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  /**
   * Forward audio buffer to AI service for Whisper transcription.
   * Returns { text: string }
   */
  async transcribe(file: Express.Multer.File): Promise<{ text: string }> {
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'https://twoconnectv1-ai.onrender.com/api/v1';

    const ext = this.getExtension(file.mimetype);
    const filename = file.originalname || `recording.${ext}`;

    try {
      this.logger.log(`[VOICE] Forwarding ${file.size} bytes (${file.mimetype}) to AI service`);

      // Use form-data package for proper multipart construction
      const form = new FormData();
      form.append('file', file.buffer, {
        filename,
        contentType: file.mimetype,
      });

      const response = await axios.post(`${aiServiceUrl}/voice/transcribe`, form, {
        headers: form.getHeaders(),
        timeout: 30000,
        maxContentLength: 25 * 1024 * 1024,
        maxBodyLength: 25 * 1024 * 1024,
      });

      const text = response.data?.text || '';
      this.logger.log(`[VOICE] Transcription complete: ${text.length} chars`);

      return { text };
    } catch (error: any) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail || error.message;
      this.logger.error(`[VOICE] Transcription failed: ${status} ${detail}`);

      throw new InternalServerErrorException('Voice transcription failed. Please try again.');
    }
  }

  private getExtension(mimetype: string): string {
    const map: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/aac': 'aac',
      'audio/x-m4a': 'm4a',
      'audio/m4a': 'm4a',
    };
    return map[mimetype] || 'webm';
  }
}
