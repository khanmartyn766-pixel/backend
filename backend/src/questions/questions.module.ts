import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [QuestionsController],
  providers: [QuestionsService, JwtAuthGuard],
  exports: [QuestionsService],
})
export class QuestionsModule {}
