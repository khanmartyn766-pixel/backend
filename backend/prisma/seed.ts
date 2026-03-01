import { PrismaClient, QuestionType } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface SeedQuestion {
  id?: string;
  number: number;
  chapter: string;
  type: string;
  stem: string;
  options: unknown;
  answer: unknown;
  answerText?: string;
  explanation?: string;
  sourceFile?: string;
}

interface SeedPayload {
  version: string;
  total: number;
  questions: SeedQuestion[];
}

const prisma = new PrismaClient();

function mapType(type: string): QuestionType {
  if (type === 'multiple') return QuestionType.multiple;
  if (type === 'judge') return QuestionType.judge;
  if (type === 'short') return QuestionType.short;
  return QuestionType.single;
}

async function main() {
  const seedPath = resolve(__dirname, '../../seed_bank.json');
  const payload = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedPayload;

  const bank = await prisma.questionBank.upsert({
    where: { version: payload.version },
    update: {
      name: '专升本心理学题库',
      subject: 'psychology',
      isActive: true,
    },
    create: {
      name: '专升本心理学题库',
      subject: 'psychology',
      version: payload.version,
      isActive: true,
    },
  });

  await prisma.questionBank.updateMany({
    where: { id: { not: bank.id } },
    data: { isActive: false },
  });

  await prisma.question.deleteMany({ where: { bankId: bank.id } });

  const chunkSize = 200;
  for (let i = 0; i < payload.questions.length; i += chunkSize) {
    const chunk = payload.questions.slice(i, i + chunkSize);
    await prisma.question.createMany({
      data: chunk.map((q, idx) => ({
        bankId: bank.id,
        externalId: q.id ?? null,
        number: Number(q.number) || i + idx + 1,
        chapter: q.chapter || '未分章',
        type: mapType(q.type),
        stem: q.stem,
        options: q.options ?? [],
        answer: q.answer ?? [],
        answerText: q.answerText ?? '',
        explanation: q.explanation ?? '',
        sourceFile: q.sourceFile ?? '',
      })),
    });
  }

  console.log(`Seed completed: ${payload.total} questions, version=${payload.version}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
