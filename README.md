# Webtools

个人在线工具集合站，把常用的小工具集成到同一个站点，左侧菜单切换，右侧区域刷新展示。

## 已集成的工具

- **TOTP / 2FA** — 粘贴 `otpauth://` URI 或手动输入 secret，实时显示 6 位验证码 + 倒计时
- **匿名笔记** — URL 即笔记，自动保存到 SQLite，支持可选密码保护
- **匿名文件** — 浏览器端 AES-GCM 加密、服务端零知识，邀请码授权 + 一次性下载 + TTL 过期
- **收藏箱** — 私人知识库：给专属 TG bot 发文件/链接/文字即永久收藏，链接可一键离线保存全文（含配图，防原文被删）；前台用 TG 一次性码或 2FA 动态码解锁查看，后台可勾选打包 zip 导出
- **假身份生成** — 一键生成姓名/地址/电话/邮箱/SSN/信用卡 等，多语言区
- **密码生成** — 浏览器本地用 `crypto.getRandomValues` 生成强密码 / passphrase / 随机用户名，不上传任何数据

## 快速开始

### 本地开发

```bash
cp .env.example .env.local
# 生成管理员密码哈希
node -e "require('argon2').hash('your-password').then(console.log)"
# 生成 SESSION_SECRET
openssl rand -base64 48
# 把上面两个值填进 .env.local
# 注意：argon2 哈希里每个 $ 都要转义成 \$（dotenv 否则会插值，登录会一直 401）
npm install
npm run dev
```

打开 `http://localhost:3000`。后台地址 `/admin`，用 `.env.local` 里的账号密码登录。

### Docker 部署

```bash
cp .env.example .env.production
# 同样填好 ADMIN_USERNAME / ADMIN_PASSWORD_HASH / SESSION_SECRET
docker compose up -d --build
```

数据持久化在 `./data/`，定期备份这个目录即可。

### 定期清理（推荐用宿主机 cron）

后台手动有"清理 90 天未访问"按钮，自动化建议加 cron：

```bash
# 每天凌晨 3 点登录后清笔记 + 日志
# 编辑 crontab：crontab -e
0 3 * * * curl -s -c /tmp/wt.jar -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"YOUR_PWD"}' >/dev/null && curl -s -b /tmp/wt.jar -X DELETE http://localhost:3000/api/admin/notes -H 'Content-Type: application/json' -d '{"olderThanDays":90}' && curl -s -b /tmp/wt.jar -X DELETE http://localhost:3000/api/admin/audit -H 'Content-Type: application/json' -d '{"olderThanDays":180}'
```

如果开了 2FA，cron 没法自动过二步验证，建议给清理脚本单独留一个无 2FA 的服务账号；或者每日数据库快照备份后用 SQL 直接清理。

### 配额与限流

防止笔记接口被刷的硬限制集中在 `lib/limits.ts`：

- 单条笔记最大 64 KB
- 全局笔记总数软上限 5000 条
- 登录 5 次/15 分钟，2FA 10 次/5 分钟
- 笔记密码尝试 5 次/10 分钟（per IP+slug），笔记保存 30 次/分钟，新笔记创建 20 个/小时

被限流时返回 HTTP 429 + `Retry-After`，事件会写入 `/admin/audit` 操作日志。

## 添加新工具

参考 `CLAUDE.md` 的 "添加新工具的步骤"。简单来说三步：写组件、注册到 registry、重新部署。

## 技术栈

Next.js 15 (App Router) · React 19 · TypeScript · SQLite (better-sqlite3) · iron-session · Tailwind CSS
