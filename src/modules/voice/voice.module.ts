import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { AIServiceModule } from 'src/integration/ai-service/ai-service.module';

@Module({
  imports: [AIServiceModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
