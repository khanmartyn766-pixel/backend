# Backend（NestJS + Prisma + PostgreSQL）

本目录是专升本心理学刷题 App 的后端骨架，包含：
- 登录鉴权（JWT）
- 学生白名单（学号+邀请码+手机号）
- 设备数限制（每个学生账号限制登录设备数量）
- 老师管理接口（admin：导入白名单、冻结账号、改设备上限）
- 题库查询（章节/分页）
- 练习提交、错题本、学习统计
- Prisma 数据模型与种子脚本

## 1. 环境准备

1. 复制环境变量

```bash
cp .env.example .env
```

2. 配置环境变量（至少设置）
- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_SECRET`

## 2. 安装与初始化

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run import:students
```

## 3. 启动

```bash
npm run start:dev
```

默认地址：`http://localhost:3000/api/v1`

## 4. API 列表

### 4.1 Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/check-student-access`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`（Bearer Token）

示例：

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone":"13800000001",
    "password":"Password123",
    "inviteCode":"PSY2026A",
    "deviceId":"mini-device-001",
    "deviceName":"iPhone 15",
    "platform":"ios",
    "nickname":"Tom"
  }'
```

首次注册默认不需要传 `studentNo`，仅在“同一手机号 + 邀请码匹配到多个学生档案”时，才需要补充 `studentNo` 以消歧。

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone":"13800000001",
    "password":"Password123",
    "deviceId":"mini-device-001",
    "deviceName":"iPhone 15",
    "platform":"ios"
  }'
```

### 4.2 Questions（需要登录）

- `GET /api/v1/questions/chapters`
- `GET /api/v1/questions?page=1&pageSize=20&chapter=...&type=single`

说明：
- 两个接口都需要 `Authorization: Bearer <TOKEN>`
- 题目列表默认不返回 `answer/answerText/explanation`，避免答案泄露

### 4.3 Practice（需要登录）

- `POST /api/v1/practice/submit`
- `GET /api/v1/practice/wrong-book?limit=100`
- `GET /api/v1/practice/stats`

示例：

```bash
curl -X POST http://localhost:3000/api/v1/practice/submit \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"questionId":"<QUESTION_ID>","selected":["A"],"mode":"practice"}'
```

### 4.4 Admin（老师管理，需 `x-admin-secret`）

- `GET /api/v1/admin/students`
- `POST /api/v1/admin/students/upsert`
- `PATCH /api/v1/admin/students/:id/status`
- `PATCH /api/v1/admin/students/:id/device-limit`
- `POST /api/v1/admin/students/:id/reset-devices`
- `POST /api/v1/admin/students/import-csv`
- `GET /api/v1/admin/students/template-csv`

示例：

```bash
curl 'http://localhost:3000/api/v1/admin/students?page=1&pageSize=20' \
  -H 'x-admin-secret: your-admin-secret'
```

```bash
curl -X POST 'http://localhost:3000/api/v1/admin/students/upsert' \
  -H 'Content-Type: application/json' \
  -H 'x-admin-secret: your-admin-secret' \
  -d '{
    "studentNo":"20269999",
    "name":"新同学",
    "phone":"13800009999",
    "className":"心理学3班",
    "inviteCode":"PSY2026C",
    "maxDevices":1,
    "expiresAt":"2026-12-31",
    "status":"ACTIVE"
  }'
```

## 5. 题库种子来源

`prisma/seed.ts` 会读取项目根目录的 `seed_bank.json`，并写入数据库：
- 激活当前版本题库
- 停用旧版本题库
- 批量写入题目

## 6. 学生白名单导入

- 模板文件：`scripts/students_template.csv`
- 导入命令：

```bash
npm run import:students -- --file=./scripts/students_template.csv
```

CSV 字段：
- `studentNo`：学号（唯一）
- `name`：姓名
- `phone`：手机号（与登录手机号一致）
- `className`：班级
- `inviteCode`：邀请码
- `maxDevices`：最多设备数（默认 1）
- `expiresAt`：到期日期（如 `2026-12-31`）
- `status`：`ACTIVE` 或 `FROZEN`
