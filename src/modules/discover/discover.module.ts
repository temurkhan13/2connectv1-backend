import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DiscoverController } from './discover.controller';
import { DiscoverService } from './discover.service';
import { User } from 'src/common/entities/user.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { ConnectionInterest } from 'src/common/entities/connection-interest.entity';
import { BrowseHistory } from 'src/common/entities/browse-history.entity';
import { Match } from 'src/common/entities/match.entity';

/**
 * Discover Module
 * Phase 3.3: Interactive Search/Browse
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      User,
      UserSummaries,
      ConnectionInterest,
      BrowseHistory,
      Match,
    ]),
  ],
  controllers: [DiscoverController],
  providers: [DiscoverService],
  exports: [DiscoverService],
})
export class DiscoverModule {}
