import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const MODES = ['practice', 'exam'] as const;

export class SubmitPracticeDto {
  @IsString()
  @MinLength(5)
  questionId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  selected?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  selectedText?: string;

  @IsOptional()
  @IsIn(MODES)
  mode?: (typeof MODES)[number] = 'practice';
}
