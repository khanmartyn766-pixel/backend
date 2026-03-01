import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CheckStudentAccessDto {
  @IsString()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  studentNo?: string;

  @IsString()
  @MinLength(4)
  @MaxLength(32)
  inviteCode!: string;
}
