import { Global, Module } from '@nestjs/common';
import { loadAIServiceConfig } from 'src/integration/ai-service/config/ai-service.config';
import { AIServiceHttpClient } from 'src/integration/ai-service/services/http.service';
import { HttpModule } from '@nestjs/axios';
import { AIUserService } from 'src/integration/ai-service/services/user.service';
import { AIServiceFacade } from 'src/integration/ai-service/ai-service.facade';

/**
 * AIServiceModule
 * ---------------
 * Global module that provides AI service integration throughout the application.
 * This module is marked as @Global() so you don't need to import it in every module.
 *
 * Architecture:
 * - AIServiceConfig: Configuration management
 * - AIServiceHttpClient: Low-level HTTP communication
 * - AIUserService: User operations business logic
 * - AIServiceFacade: Unified interface for all AI operations
 *
 * Usage:
 * ```typescript
 * constructor(private readonly aiService: AIServiceFacade) {}
 * ```
 */
@Global()
@Module({
  imports: [HttpModule],
  providers: [
    {
      provide: 'AI_SERVICE_CONFIG',
      useFactory: loadAIServiceConfig,
    },
    {
      provide: AIServiceHttpClient,
      useFactory: config => new AIServiceHttpClient(config),
      inject: ['AI_SERVICE_CONFIG'],
    },
    AIUserService,
    AIServiceFacade,
  ],
  exports: [AIServiceFacade],
})
export class AIServiceModule {}
