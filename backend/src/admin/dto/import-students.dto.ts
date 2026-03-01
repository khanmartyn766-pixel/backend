import { IsString, MinLength } from 'class-validator';

export class ImportStudentsDto {
  @IsString()
  @MinLength(10)
  csvText!: string;
}
