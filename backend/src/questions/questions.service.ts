import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryQuestionsDto } from './dto/query-questions.dto';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listChapters() {
    const bank = await this.getActiveBank();

    const chapters = await this.prisma.question.findMany({
      where: { bankId: bank.id },
      select: { chapter: true },
      distinct: ['chapter'],
      orderBy: { chapter: 'asc' },
    });

    return {
      bank: {
        id: bank.id,
        version: bank.version,
      },
      chapters: chapters.map((item) => item.chapter),
    };
  }

  async query(dto: QueryQuestionsDto) {
    const bank = await this.getActiveBank();
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;

    const where: Prisma.QuestionWhereInput = {
      bankId: bank.id,
    };

    if (dto.chapter) {
      where.chapter = dto.chapter;
    }

    if (dto.type) {
      where.type = dto.type as QuestionType;
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        orderBy: { number: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      bank: {
        id: bank.id,
        version: bank.version,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      items: items.map((item) => ({
        id: item.id,
        number: item.number,
        chapter: item.chapter,
        type: item.type,
        stem: item.stem,
        options: item.options,
      })),
    };
  }

  private async getActiveBank() {
    const bank = await this.prisma.questionBank.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!bank) {
      throw new NotFoundException('当前没有可用题库，请先导入并发布题库');
    }

    return bank;
  }
}
