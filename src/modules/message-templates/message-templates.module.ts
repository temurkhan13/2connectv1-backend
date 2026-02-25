import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { MessageTemplatesService } from 'src/modules/message-templates/message-templates.service';
import { MessageTemplatesController } from 'src/modules/message-templates/message-templates.controller';
import { UserModule } from 'src/modules/user/user.module';
import { MessageTemplate } from 'src/common/entities/message-template.entity';

@Module({
  imports: [SequelizeModule.forFeature([MessageTemplate]), UserModule],
  controllers: [MessageTemplatesController],
  providers: [MessageTemplatesService],
})
export class MessageTemplatesModule {}
