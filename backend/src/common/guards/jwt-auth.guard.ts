import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../types/auth-user.interface';

interface JwtPayload {
  sub: string;
  phone: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();

    const authHeader = request.headers.authorization || request.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice(7);
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new UnauthorizedException('JWT secret is not configured');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { studentAccount: true },
      });

      if (!user) {
        throw new UnauthorizedException('用户不存在');
      }

      if (!user.studentAccount) {
        throw new ForbiddenException('账号未绑定学生档案');
      }

      if (user.studentAccount.status !== StudentStatus.ACTIVE) {
        throw new ForbiddenException('该学生账号已被冻结');
      }

      if (user.studentAccount.expiresAt && user.studentAccount.expiresAt.getTime() < Date.now()) {
        throw new ForbiddenException('该学生账号已过期，请联系老师续期');
      }

      if (user.studentAccount.phone !== user.phone) {
        throw new ForbiddenException('手机号与学生档案不一致，请联系老师处理');
      }

      request.user = { userId: payload.sub, phone: user.phone };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
