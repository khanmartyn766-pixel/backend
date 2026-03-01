import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const STATUS = ['ACTIVE', 'FROZEN'] as const;

export class UpsertStudentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  studentNo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsString()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  className?: string;

  @IsString()
  @MinLength(4)
  @MaxLength(32)
  inviteCode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  maxDevices?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsIn(STATUS)
  status?: (typeof STATUS)[number];
}
