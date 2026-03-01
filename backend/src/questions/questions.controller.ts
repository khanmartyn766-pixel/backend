import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import { QuestionsService } from './questions.service';

@UseGuards(JwtAuthGuard)
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get('chapters')
  async chapters() {
    return this.questionsService.listChapters();
  }

  @Get()
  async list(@Query() query: QueryQuestionsDto) {
    return this.questionsService.query(query);
  }
}
