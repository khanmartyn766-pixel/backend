# 服务器一键部署（Docker Compose）

本方案用于替代 CloudBase Run，直接在一台 Linux 服务器部署：
- PostgreSQL（容器）
- 后端 API（容器）

## 1) 服务器准备

建议 Ubuntu 22.04，放行端口：
- 22（SSH）
- 3000（API 测试）

安装 Docker + Compose：

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 2) 拉代码

```bash
git clone https://github.com/khanmartyn766-pixel/backend.git
cd backend/deploy
```

## 3) 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少改这三个值：
- `DB_PASSWORD`
- `JWT_SECRET`
- `ADMIN_SECRET`

## 4) 启动

```bash
docker compose --env-file .env up -d --build
```

查看日志：

```bash
docker compose logs -f backend
```

## 5) 验证

```bash
curl -i http://服务器IP:3000/api/v1/questions/chapters
```

返回 `401 Missing bearer token` 即服务正常。

管理员接口测试：

```bash
curl -i -H "x-admin-secret: 你的ADMIN_SECRET" "http://服务器IP:3000/api/v1/admin/students?page=1&pageSize=1"
```

## 6) 小程序 API 地址

将小程序配置改成你的服务器域名（或临时 IP）：

`https://你的域名/api/v1`

注意：微信小程序正式发布必须使用已备案 HTTPS 域名。
