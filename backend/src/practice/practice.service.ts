import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user.interface';
import { SubmitPracticeDto } from './dto/submit-practice.dto';

@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(user: AuthUser, dto: SubmitPracticeDto) {
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });

    if (!question) {
      throw new NotFoundException('题目不存在');
    }

    const mode = dto.mode ?? 'practice';
    const selected = this.normalizeSelected(dto.selected ?? []);
    const selectedText = (dto.selectedText || '').trim();

    const expectedAnswer = this.toStringArray(question.answer);
    let correct = false;

    if (question.type !== 'short') {
      correct = this.sameAnswerSet(selected, expectedAnswer);
    }

    const selectedPayload = {
      selected,
      selectedText,
    };

    await this.prisma.practiceRecord.create({
      data: {
        userId: user.userId,
        questionId: question.id,
        selected: selectedPayload,
        correct,
        mode,
      },
    });

    return {
      questionId: question.id,
      type: question.type,
      correct,
      answer: expectedAnswer,
      answerText: question.answerText || '',
      explanation: question.explanation || '',
    };
  }

  async wrongBook(user: AuthUser, limit = 100) {
    const records = await this.prisma.practiceRecord.findMany({
      where: {
        userId: user.userId,
        correct: false,
      },
      include: {
        question: true,
      },
      orderBy: {
        answeredAt: 'desc',
      },
      take: Math.min(limit, 500),
    });

    const bucket = new Map<
      string,
      {
        wrongCount: number;
        lastWrongAt: string;
        question: {
          id: string;
          chapter: string;
          type: string;
          stem: string;
          options: unknown;
          answer: unknown;
          answerText: string | null;
          explanation: string | null;
        };
      }
    >();

    for (const record of records) {
      const exists = bucket.get(record.questionId);
      if (exists) {
        exists.wrongCount += 1;
        continue;
      }

      bucket.set(record.questionId, {
        wrongCount: 1,
        lastWrongAt: record.answeredAt.toISOString(),
        question: {
          id: record.question.id,
          chapter: record.question.chapter,
          type: record.question.type,
          stem: record.question.stem,
          options: record.question.options,
          answer: record.question.answer,
          answerText: record.question.answerText,
          explanation: record.question.explanation,
        },
      });
    }

    const items = [...bucket.values()].sort((a, b) => b.wrongCount - a.wrongCount);

    return {
      totalWrongQuestions: items.length,
      items,
    };
  }

  async stats(user: AuthUser) {
    const [total, correct] = await this.prisma.$transaction([
      this.prisma.practiceRecord.count({ where: { userId: user.userId } }),
      this.prisma.practiceRecord.count({
        where: { userId: user.userId, correct: true },
      }),
    ]);

    const wrong = total - correct;
    return {
      answered: total,
      correct,
      wrong,
      accuracy: total === 0 ? 0 : Number((correct / total).toFixed(4)),
    };
  }

  private normalizeSelected(selected: string[]): string[] {
    return [...new Set(selected.map((item) => item.toUpperCase().trim()).filter(Boolean))].sort();
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => String(item).toUpperCase().trim())
      .filter(Boolean)
      .sort();
  }

  private sameAnswerSet(selected: string[], answer: string[]) {
    if (selected.length !== answer.length) {
      return false;
    }
    return selected.every((item, index) => item === answer[index]);
  }
}
