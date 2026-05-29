# Cloudflare Email Worker for tempmail

把这个 Worker 部署到 Cloudflare，让发往你域名的所有邮件自动转给 webtools。

## 一次性配置流程

### 1. 把域名挂到 Cloudflare（如已挂跳过）

域名注册商那里把 NS 改成 Cloudflare 给的两条 NS，等生效（一般几分钟到几小时）。

### 2. 启用 Email Routing

CF Dashboard → 你的域名 → Email Routing → Get started。按提示让 CF 自动加 MX + SPF + TXT 记录。

### 3. 创建 Email Worker

两种方式：

**方式 A：Dashboard 粘贴（最快）**
1. Workers & Pages → Create application → Create Worker → 命名 `tempmail-worker`
2. 进 Worker → Edit code → 把整个 `tempmail-worker.js` 粘进去 → Deploy
3. Worker → Settings → Variables and Secrets → Add variable：
   - `WEBTOOLS_URL` = `https://your-webtools.example.com`（你 webtools 的公网地址）
   - `WEBHOOK_SECRET` = 跟 webtools `.env` 里 `TEMPMAIL_WEBHOOK_SECRET` 完全一致
4. 注意：Dashboard 粘贴方式不会自动打包 `postal-mime` 依赖。如果遇到 `Cannot find module` 报错，用方式 B。

**方式 B：用 wrangler 本地部署（推荐，自动处理 postal-mime 依赖）**
```bash
cd cf-worker
npm init -y && npm install postal-mime
npm install -g wrangler   # 已装跳过
wrangler login            # 浏览器弹窗授权
wrangler secret put WEBHOOK_SECRET    # 粘贴 secret
wrangler secret put WEBTOOLS_URL      # 粘贴 webtools URL
wrangler deploy
```

### 4. 把 Email Routing 指到这个 Worker

CF Dashboard → 域名 → Email Routing → Routing rules → **Catch-all address** → 编辑 → Action 选 `Send to a Worker` → 选 `tempmail-worker` → Save。

> Catch-all 意味着 `任意@你的域名` 都进 Worker。临时邮箱场景需要这个。

### 5. 配置 webtools

`.env`（或 `.env.local`）加：
```
TEMPMAIL_DOMAIN=yourdomain.com
TEMPMAIL_WEBHOOK_SECRET=<跟 Worker 里完全一致的随机串>
```

生成 secret：
```bash
openssl rand -hex 32
```

重启 webtools，访问 `/tempmail` 看到自动生成的 `xxx@yourdomain.com` 即配置成功。

## 验证

随便用别的邮箱给 `test@yourdomain.com` 发一封，30 秒内应该出现在 `/tempmail/{slug}` 列表里。

查 Worker 日志：CF Dashboard → Worker → Logs → 实时查看请求。

## 注意事项

- **必须公网可达**：webtools 部署在内网的话，Worker 调不到 `/api/tempmail/inbound`。用 Cloudflare Tunnel 或反向代理打通。
- **Email Workers 免费配额**：CF 免费计划每天 100k Worker 调用，临时邮箱场景完全够。
- **失败邮件会被丢弃**：Worker 调 webhook 失败时不会 setReject，发件人以为送达了。这是有意的（避免暴露过滤规则给攻击者）。
- **附件不支持**：当前实现只转发 text/html，附件被丢弃。临时邮箱场景一般不需要。
