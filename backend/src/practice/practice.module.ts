import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [PracticeController],
  providers: [PracticeService, JwtAuthGuard],
})
export class PracticeModule {}
