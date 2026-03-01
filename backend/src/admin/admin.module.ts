import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminSecretGuard } from '../common/guards/admin-secret.guard';

@Module({
  imports: [ConfigModule],
  controllers: [AdminController],
  providers: [AdminService, AdminSecretGuard],
})
export class AdminModule {}
