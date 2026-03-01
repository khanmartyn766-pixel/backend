import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const QUESTION_TYPES = ['single', 'multiple', 'judge', 'short'] as const;

export class QueryQuestionsDto {
  @IsOptional()
  @IsString()
  chapter?: string;

  @IsOptional()
  @IsIn(QUESTION_TYPES)
  type?: (typeof QUESTION_TYPES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 20;
}
