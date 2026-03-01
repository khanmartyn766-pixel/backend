import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser } from '../common/types/auth-user.interface';
import { QueryWrongBookDto } from './dto/query-wrong-book.dto';
import { SubmitPracticeDto } from './dto/submit-practice.dto';
import { PracticeService } from './practice.service';

@UseGuards(JwtAuthGuard)
@Controller('practice')
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post('submit')
  async submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitPracticeDto) {
    return this.practiceService.submit(user, dto);
  }

  @Get('wrong-book')
  async wrongBook(@CurrentUser() user: AuthUser, @Query() query: QueryWrongBookDto) {
    return this.practiceService.wrongBook(user, query.limit ?? 100);
  }

  @Get('stats')
  async stats(@CurrentUser() user: AuthUser) {
    return this.practiceService.stats(user);
  }
}
