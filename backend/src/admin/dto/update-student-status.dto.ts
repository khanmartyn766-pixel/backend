import { IsIn } from 'class-validator';

const STATUS = ['ACTIVE', 'FROZEN'] as const;

export class UpdateStudentStatusDto {
  @IsIn(STATUS)
  status!: (typeof STATUS)[number];
}
