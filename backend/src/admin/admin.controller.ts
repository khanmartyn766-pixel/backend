import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminSecretGuard } from '../common/guards/admin-secret.guard';
import { AdminService } from './admin.service';
import { ImportStudentsDto } from './dto/import-students.dto';
import { QueryStudentsDto } from './dto/query-students.dto';
import { UpdateDeviceLimitDto } from './dto/update-device-limit.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { UpsertStudentDto } from './dto/upsert-student.dto';

@UseGuards(AdminSecretGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('students')
  async listStudents(@Query() query: QueryStudentsDto) {
    return this.adminService.listStudents(query);
  }

  @Post('students/upsert')
  async upsertStudent(@Body() dto: UpsertStudentDto) {
    return this.adminService.upsertStudent(dto);
  }

  @Patch('students/:id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStudentStatusDto) {
    return this.adminService.updateStatus(id, dto);
  }

  @Patch('students/:id/device-limit')
  async updateDeviceLimit(@Param('id') id: string, @Body() dto: UpdateDeviceLimitDto) {
    return this.adminService.updateDeviceLimit(id, dto);
  }

  @Post('students/:id/reset-devices')
  async resetDevices(@Param('id') id: string) {
    return this.adminService.resetDevices(id);
  }

  @Post('students/import-csv')
  async importCsv(@Body() dto: ImportStudentsDto) {
    return this.adminService.importCsv(dto);
  }

  @Get('students/template-csv')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async templateCsv() {
    return this.adminService.getTemplateCsv();
  }
}
