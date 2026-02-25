import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { MatchesService } from 'src/modules/matches/matches.service';
import { MatchesController } from 'src/modules/matches/matches.controller';
import { Match } from 'src/common/entities/match.entity';
import { MatchBatch } from 'src/common/entities/match-batch.entity';
import { AIServiceModule } from 'src/integration/ai-service/ai-service.module';

@Module({
  imports: [
    SequelizeModule.forFeature([MatchBatch, Match]),
    AIServiceModule, // Import to use AIServiceFacade
  ],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
