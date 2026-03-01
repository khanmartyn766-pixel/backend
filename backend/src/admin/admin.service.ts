import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImportStudentsDto } from './dto/import-students.dto';
import { QueryStudentsDto } from './dto/query-students.dto';
import { UpdateDeviceLimitDto } from './dto/update-device-limit.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { UpsertStudentDto } from './dto/upsert-student.dto';

type CsvRow = {
  studentNo: string;
  name: string;
  phone: string;
  className?: string;
  inviteCode: string;
  maxDevices?: number;
  expiresAt?: string;
  status?: 'ACTIVE' | 'FROZEN';
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listStudents(query: QueryStudentsDto) {
    const where: Prisma.StudentAccountWhereInput = {};
    if (query.status) {
      where.status = query.status as StudentStatus;
    }
    if (query.className) {
      where.className = query.className;
    }
    if (query.keyword) {
      where.OR = [
        { studentNo: { contains: query.keyword, mode: 'insensitive' } },
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { phone: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.studentAccount.count({ where }),
      this.prisma.studentAccount.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              _count: {
                select: {
                  devices: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      items: items.map((item) => ({
        id: item.id,
        studentNo: item.studentNo,
        name: item.name,
        phone: item.phone,
        className: item.className,
        inviteCode: item.inviteCode,
        status: item.status,
        maxDevices: item.maxDevices,
        expiresAt: item.expiresAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        user: item.user
          ? {
              id: item.user.id,
              phone: item.user.phone,
              deviceCount: item.user._count.devices,
            }
          : null,
      })),
    };
  }

  async upsertStudent(dto: UpsertStudentDto) {
    const payload = this.normalizeRow(dto);

    const exists = await this.prisma.studentAccount.findUnique({
      where: { studentNo: payload.studentNo },
    });

    const item = exists
      ? await this.prisma.studentAccount.update({
          where: { id: exists.id },
          data: payload,
        })
      : await this.prisma.studentAccount.create({
          data: payload,
        });

    return {
      action: exists ? 'updated' : 'created',
      item,
    };
  }

  async updateStatus(studentId: string, dto: UpdateStudentStatusDto) {
    const exists = await this.prisma.studentAccount.findUnique({ where: { id: studentId } });
    if (!exists) {
      throw new NotFoundException('学生档案不存在');
    }

    const item = await this.prisma.studentAccount.update({
      where: { id: studentId },
      data: { status: dto.status as StudentStatus },
    });

    return { item };
  }

  async updateDeviceLimit(studentId: string, dto: UpdateDeviceLimitDto) {
    const exists = await this.prisma.studentAccount.findUnique({
      where: { id: studentId },
      include: { user: true },
    });
    if (!exists) {
      throw new NotFoundException('学生档案不存在');
    }

    const item = await this.prisma.studentAccount.update({
      where: { id: studentId },
      data: { maxDevices: dto.maxDevices },
    });

    if (exists.user) {
      const devices = await this.prisma.userDevice.findMany({
        where: { userId: exists.user.id },
        orderBy: { lastLoginAt: 'desc' },
      });

      if (devices.length > dto.maxDevices) {
        const removeIds = devices.slice(dto.maxDevices).map((d) => d.id);
        if (removeIds.length) {
          await this.prisma.userDevice.deleteMany({
            where: { id: { in: removeIds } },
          });
        }
      }
    }

    return { item };
  }

  async resetDevices(studentId: string) {
    const student = await this.prisma.studentAccount.findUnique({
      where: { id: studentId },
      include: { user: true },
    });
    if (!student) {
      throw new NotFoundException('学生档案不存在');
    }

    if (!student.user) {
      return { deleted: 0, message: '该学生尚未绑定用户' };
    }

    const result = await this.prisma.userDevice.deleteMany({
      where: { userId: student.user.id },
    });

    return {
      deleted: result.count,
      message: '已清空该学生账号的设备绑定',
    };
  }

  async importCsv(dto: ImportStudentsDto) {
    const rows = this.parseCsv(dto.csvText);
    const stats = {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        const payload = this.normalizeRow(row);
        const exists = await this.prisma.studentAccount.findUnique({
          where: { studentNo: payload.studentNo },
        });

        if (exists) {
          await this.prisma.studentAccount.update({
            where: { id: exists.id },
            data: payload,
          });
          stats.updated += 1;
        } else {
          await this.prisma.studentAccount.create({ data: payload });
          stats.created += 1;
        }
      } catch (error) {
        stats.skipped += 1;
        stats.errors.push(`line ${i + 2}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return stats;
  }

  getTemplateCsv() {
    return [
      'studentNo,name,phone,className,inviteCode,maxDevices,expiresAt,status',
      '20260001,张三,13800000001,心理学1班,PSY2026A,1,2026-12-31,ACTIVE',
      '20260002,李四,13800000002,心理学1班,PSY2026A,2,2026-12-31,ACTIVE',
    ].join('\n');
  }

  private parseCsv(raw: string): CsvRow[] {
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return [];
    }

    const header = lines[0].split(',').map((x) => x.trim());
    const headerMap: Record<string, number> = {};
    header.forEach((h, idx) => {
      headerMap[h] = idx;
    });

    const required = ['studentNo', 'name', 'phone', 'inviteCode'];
    required.forEach((key) => {
      if (headerMap[key] === undefined) {
        throw new Error(`CSV 缺少字段: ${key}`);
      }
    });

    return lines.slice(1).map((line) => {
      const cols = line.split(',').map((x) => x.trim());
      const pick = (key: string): string => {
        const idx = headerMap[key];
        if (idx === undefined) {
          return '';
        }
        return cols[idx] || '';
      };
      return {
        studentNo: pick('studentNo'),
        name: pick('name'),
        phone: pick('phone'),
        className: pick('className'),
        inviteCode: pick('inviteCode'),
        maxDevices: pick('maxDevices') ? Number(pick('maxDevices')) : undefined,
        expiresAt: pick('expiresAt') || undefined,
        status: (pick('status') || 'ACTIVE').toUpperCase() as 'ACTIVE' | 'FROZEN',
      };
    });
  }

  private normalizeRow(input: CsvRow | UpsertStudentDto) {
    const studentNo = String(input.studentNo || '').trim();
    const name = String(input.name || '').trim();
    const phone = String(input.phone || '').trim();
    const inviteCode = String(input.inviteCode || '').trim();

    if (!studentNo || !name || !phone || !inviteCode) {
      throw new Error('studentNo/name/phone/inviteCode 不能为空');
    }

    if (!/^1\d{10}$/.test(phone)) {
      throw new Error('手机号格式错误');
    }

    const maxDevicesNum = Math.max(1, Number(input.maxDevices || 1));
    const statusRaw = String(input.status || 'ACTIVE').toUpperCase();
    const status = statusRaw === 'FROZEN' ? StudentStatus.FROZEN : StudentStatus.ACTIVE;

    let expiresAt: Date | null = null;
    if (input.expiresAt) {
      const d = new Date(input.expiresAt);
      if (Number.isNaN(d.getTime())) {
        throw new Error('expiresAt 日期格式错误');
      }
      expiresAt = d;
    }

    return {
      studentNo,
      name,
      phone,
      className: input.className ? String(input.className).trim() : null,
      inviteCode,
      maxDevices: maxDevicesNum,
      expiresAt,
      status,
    };
  }
}
