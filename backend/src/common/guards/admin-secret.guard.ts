import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminSecretGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();

    const expected = this.configService.get<string>('ADMIN_SECRET');
    if (!expected) {
      throw new ForbiddenException('ADMIN_SECRET 未配置，已拒绝访问');
    }

    const actual = req.headers['x-admin-secret'] || req.headers['X-Admin-Secret'];
    if (!actual || actual !== expected) {
      throw new UnauthorizedException('管理员密钥错误');
    }

    return true;
  }
}
