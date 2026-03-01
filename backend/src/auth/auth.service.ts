import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  MembershipPlan,
  MembershipStatus,
  StudentAccount,
  StudentStatus,
  User,
} from '@prisma/client';
import { AuthUser } from '../common/types/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CheckStudentAccessDto } from './dto/check-student-access.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password.util';

export interface AuthResult {
  token: string;
  user: {
    id: string;
    phone: string;
    nickname: string | null;
    membership: {
      plan: MembershipPlan;
      status: MembershipStatus;
      expiredAt: string | null;
    };
    student: {
      studentNo: string;
      name: string;
      className: string | null;
      status: StudentStatus;
      expiresAt: string | null;
      maxDevices: number;
    };
    device: {
      currentDeviceId: string;
      boundDevices: number;
      maxDevices: number;
    };
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async checkStudentAccess(dto: CheckStudentAccessDto) {
    const student = await this.findStudentAccountForAccess({
      phone: dto.phone,
      inviteCode: dto.inviteCode,
      studentNo: dto.studentNo,
      requireUnbound: false,
    });

    return {
      allowed: true,
      student: {
        studentNo: student.studentNo,
        name: student.name,
        className: student.className,
        maxDevices: student.maxDevices,
        expiresAt: student.expiresAt?.toISOString() ?? null,
        alreadyBound: !!student.user,
      },
    };
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const normalizedInviteCode = dto.inviteCode.trim();

    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new BadRequestException('手机号已注册');
    }

    const student = await this.findStudentAccountForAccess({
      phone: dto.phone,
      inviteCode: normalizedInviteCode,
      studentNo: dto.studentNo,
      requireUnbound: true,
    });

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        passwordHash: hashPassword(dto.password),
        nickname: dto.nickname?.trim() || null,
        studentAccount: {
          connect: { id: student.id },
        },
        membership: {
          create: {
            plan: MembershipPlan.FREE,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      include: {
        membership: true,
        studentAccount: true,
      },
    });

    const deviceState = await this.bindDevice({
      userId: user.id,
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
      platform: dto.platform,
      maxDevices: student.maxDevices,
    });

    return this.buildAuthResult(user, dto.deviceId, deviceState);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: {
        membership: true,
        studentAccount: true,
      },
    });

    if (!user || !verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('手机号或密码错误');
    }

    if (!user.studentAccount) {
      throw new ForbiddenException('账号未绑定学生档案，请联系老师开通');
    }

    this.assertStudentStatus(user.studentAccount);

    if (user.studentAccount.phone !== dto.phone) {
      throw new ForbiddenException('手机号与学生档案不一致，请联系老师处理');
    }

    const deviceState = await this.bindDevice({
      userId: user.id,
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
      platform: dto.platform,
      maxDevices: user.studentAccount.maxDevices,
    });

    return this.buildAuthResult(user, dto.deviceId, deviceState);
  }

  async me(authUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
      include: {
        membership: true,
        studentAccount: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    if (!user.studentAccount) {
      throw new ForbiddenException('账号未绑定学生档案，请联系老师');
    }

    this.assertStudentStatus(user.studentAccount);
    if (user.studentAccount.phone !== user.phone) {
      throw new ForbiddenException('手机号与学生档案不一致，请联系老师处理');
    }

    const boundDevices = await this.prisma.userDevice.count({ where: { userId: user.id } });

    return {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      membership: {
        plan: user.membership?.plan ?? MembershipPlan.FREE,
        status: user.membership?.status ?? MembershipStatus.ACTIVE,
        expiredAt: user.membership?.expiredAt?.toISOString() ?? null,
      },
      student: {
        studentNo: user.studentAccount.studentNo,
        name: user.studentAccount.name,
        className: user.studentAccount.className,
        status: user.studentAccount.status,
        expiresAt: user.studentAccount.expiresAt?.toISOString() ?? null,
        maxDevices: user.studentAccount.maxDevices,
      },
      device: {
        boundDevices,
        maxDevices: user.studentAccount.maxDevices,
      },
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async bindDevice(params: {
    userId: string;
    deviceId: string;
    deviceName?: string;
    platform?: string;
    maxDevices: number;
  }): Promise<{ boundDevices: number }> {
    const normalizedDeviceId = params.deviceId.trim();
    if (!normalizedDeviceId) {
      throw new BadRequestException('deviceId 不能为空');
    }

    const existing = await this.prisma.userDevice.findUnique({
      where: {
        userId_deviceId: {
          userId: params.userId,
          deviceId: normalizedDeviceId,
        },
      },
    });

    if (existing) {
      await this.prisma.userDevice.update({
        where: { id: existing.id },
        data: {
          deviceName: params.deviceName || existing.deviceName,
          platform: params.platform || existing.platform,
          lastLoginAt: new Date(),
        },
      });

      const boundDevices = await this.prisma.userDevice.count({ where: { userId: params.userId } });
      return {
        boundDevices,
      };
    }

    const total = await this.prisma.userDevice.count({ where: { userId: params.userId } });
    if (total >= params.maxDevices) {
      throw new ForbiddenException(`当前账号最多允许 ${params.maxDevices} 台设备登录`);
    }

    await this.prisma.userDevice.create({
      data: {
        userId: params.userId,
        deviceId: normalizedDeviceId,
        deviceName: params.deviceName?.trim() || null,
        platform: params.platform?.trim() || null,
        lastLoginAt: new Date(),
      },
    });

    return {
      boundDevices: total + 1,
    };
  }

  private async findStudentAccountForAccess(options: {
    phone: string;
    inviteCode: string;
    studentNo?: string;
    requireUnbound: boolean;
  }): Promise<StudentAccount & { user: User | null }> {
    const normalizedPhone = options.phone.trim();
    const normalizedInviteCode = options.inviteCode.trim();
    const normalizedStudentNo = String(options.studentNo || '').trim();

    if (normalizedStudentNo) {
      const byNo = await this.prisma.studentAccount.findUnique({
        where: { studentNo: normalizedStudentNo },
        include: { user: true },
      });

      this.assertStudentAccess(byNo, {
        phone: normalizedPhone,
        inviteCode: normalizedInviteCode,
        requireUnbound: options.requireUnbound,
      });
      return byNo;
    }

    const matched = await this.prisma.studentAccount.findMany({
      where: {
        phone: normalizedPhone,
        inviteCode: normalizedInviteCode,
      },
      include: { user: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (matched.length === 0) {
      throw new ForbiddenException('手机号或邀请码不匹配，请联系老师确认白名单');
    }

    const valid = matched.filter((item) => {
      if (item.status !== StudentStatus.ACTIVE) return false;
      if (item.expiresAt && item.expiresAt.getTime() < Date.now()) return false;
      if (options.requireUnbound && item.user) return false;
      return true;
    });

    if (valid.length === 1) {
      return valid[0];
    }

    if (valid.length > 1) {
      throw new ForbiddenException('当前手机号匹配到多个学生档案，请联系老师处理白名单');
    }

    if (options.requireUnbound && matched.some((item) => !!item.user)) {
      throw new ForbiddenException('该手机号已注册，请直接登录');
    }

    const frozen = matched.find((item) => item.status !== StudentStatus.ACTIVE);
    if (frozen) {
      this.assertStudentStatus(frozen);
    }

    const expired = matched.find((item) => item.expiresAt && item.expiresAt.getTime() < Date.now());
    if (expired) {
      this.assertStudentStatus(expired);
    }

    throw new ForbiddenException('当前账号无法注册，请联系老师处理');
  }

  private assertStudentAccess(
    student: (StudentAccount & { user: User | null }) | null,
    options: {
      phone: string;
      inviteCode: string;
      requireUnbound: boolean;
    },
  ): asserts student is StudentAccount & { user: User | null } {
    if (!student) {
      throw new ForbiddenException('学生档案不存在，请联系老师录入白名单');
    }

    this.assertStudentStatus(student);

    if (student.phone !== options.phone) {
      throw new ForbiddenException('手机号与白名单不一致，请联系老师确认');
    }

    if (student.inviteCode !== options.inviteCode) {
      throw new ForbiddenException('邀请码错误');
    }

    if (options.requireUnbound && student.user) {
      throw new ForbiddenException('该学生档案已绑定账号，请直接登录');
    }
  }

  private assertStudentStatus(student: StudentAccount) {
    if (student.status !== StudentStatus.ACTIVE) {
      throw new ForbiddenException('该学生账号已被冻结');
    }

    if (student.expiresAt && student.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('该学生账号已过期，请联系老师续期');
    }
  }

  private buildAuthResult(
    user: User & {
      membership: {
        plan: MembershipPlan;
        status: MembershipStatus;
        expiredAt: Date | null;
      } | null;
      studentAccount: StudentAccount | null;
    },
    currentDeviceId: string,
    deviceState: { boundDevices: number },
  ): AuthResult {
    if (!user.studentAccount) {
      throw new ForbiddenException('账号未绑定学生档案');
    }

    const token = this.signToken(user.id, user.phone);
    return {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        membership: {
          plan: user.membership?.plan ?? MembershipPlan.FREE,
          status: user.membership?.status ?? MembershipStatus.ACTIVE,
          expiredAt: user.membership?.expiredAt?.toISOString() ?? null,
        },
        student: {
          studentNo: user.studentAccount.studentNo,
          name: user.studentAccount.name,
          className: user.studentAccount.className,
          status: user.studentAccount.status,
          expiresAt: user.studentAccount.expiresAt?.toISOString() ?? null,
          maxDevices: user.studentAccount.maxDevices,
        },
        device: {
          currentDeviceId,
          boundDevices: deviceState.boundDevices,
          maxDevices: user.studentAccount.maxDevices,
        },
      },
    };
  }

  private signToken(userId: string, phone: string): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const expiresIn = this.resolveJwtExpiresIn();

    return this.jwtService.sign(
      {
        sub: userId,
        phone,
      },
      {
        secret,
        expiresIn,
      },
    );
  }

  private resolveJwtExpiresIn(): number | import('ms').StringValue {
    const raw = String(this.configService.get<string>('JWT_EXPIRES_IN') || '7d').trim();
    if (/^\d+$/.test(raw)) {
      return Number(raw);
    }
    return raw as import('ms').StringValue;
  }
}
