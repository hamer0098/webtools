/**
 * 全站资源 / 速率配额。集中在一个文件，方便调整。
 * 单容器自用场景下默认值偏严格，正常使用够用。
 */

// ---------- 笔记 ----------

export const NOTE_LIMITS = {
  /** 单条笔记内容最大字节数 */
  MAX_CONTENT_BYTES: 64 * 1024, // 64KB
  /** 全局总条数软上限，到顶后拒绝新 slug（已存在的可继续编辑） */
  MAX_TOTAL_NOTES: 5000,
};

// ---------- 匿名文件 ----------

export const SEND_LIMITS = {
  /** 单文件大小硬上限（明文字节）：admin 新建 code 时可设的最大值，也是 admin 直传上限 */
  MAX_FILE_BYTES: 350 * 1024 * 1024, // 350MB
  /** code 未单独设置时的默认单文件上限（明文字节） */
  DEFAULT_MAX_FILE_BYTES: 50 * 1024 * 1024, // 50MB
  /**
   * 服务端按「密文长度」兜底校验时，在明文上限之上额外放行的余量。
   * 分块加密每 4MiB 块带 iv(12)+tag(16)=28B 开销，350MB 也仅 ~2.4KB；1MB 余量足够覆盖。
   */
  CIPHERTEXT_MARGIN_BYTES: 1 * 1024 * 1024,
  /** 未下载文件默认保留时长（毫秒） */
  DEFAULT_TTL_MS: 3 * 24 * 60 * 60_000, // 3 天
  /** 验证通过后授权有效期 */
  AUTH_TTL_MS: 30 * 60_000, // 30 分钟
};

// ---------- TG 机器人 ----------

export const TGBOT_LIMITS = {
  /** Telegram Bot API getFile 的官方下载硬上限：20MB，更大的文件 bot 拿不到 */
  MAX_TG_FILE_BYTES: 20 * 1024 * 1024,
};

// ---------- 临时邮箱 ----------

export const TEMPMAIL_LIMITS = {
  /** 邮箱 slug TTL：24 小时（每次访问自动滚动 last_seen） */
  MAILBOX_TTL_MS: 24 * 60 * 60_000,
  /** 单封邮件 TTL：24 小时 */
  MESSAGE_TTL_MS: 24 * 60 * 60_000,
  /** 单封邮件 text+html 总长上限，超出截断（不拒收） */
  MAX_MESSAGE_BYTES: 512 * 1024, // 512 KB
  /** 列表接口一次返回上限 */
  MAX_MESSAGES_PER_LIST: 50,
};

// ---------- 速率限制（窗口内最大次数） ----------

/** 每条限流规则：max 次 / windowMs 毫秒 */
export const RATE_LIMITS = {
  /** 登录账号密码：每 IP 5 次 / 15 分钟 */
  LOGIN: { max: 5, windowMs: 15 * 60_000 },
  /** 2FA 验证：每 IP 10 次 / 5 分钟 */
  LOGIN_2FA: { max: 10, windowMs: 5 * 60_000 },
  /** 笔记密码尝试：每 IP+slug 5 次 / 10 分钟 */
  NOTE_AUTH: { max: 5, windowMs: 10 * 60_000 },
  /** 笔记保存（PUT）：每 IP 30 次 / 分钟 */
  NOTE_PUT: { max: 30, windowMs: 60_000 },
  /** 新 slug 创建（首次 PUT 时 lazy-create）：每 IP 20 个 / 小时 */
  NOTE_CREATE: { max: 20, windowMs: 60 * 60_000 },
  /** 匿名文件密码/邀请码尝试：每 IP 10 次 / 15 分钟 */
  SEND_AUTH: { max: 10, windowMs: 15 * 60_000 },
  /** 上传：每 IP 20 次 / 小时（防滥用，下载没有限制） */
  SEND_UPLOAD: { max: 20, windowMs: 60 * 60_000 },
  /** 临时邮箱列表轮询：每 IP 30 次 / 分钟（前端 30s 轮询 + 手动刷新够用） */
  TEMPMAIL_LIST: { max: 30, windowMs: 60_000 },
  /** 创建邮箱 / 改前缀：每 IP 30 次 / 小时 */
  TEMPMAIL_CREATE: { max: 30, windowMs: 60 * 60_000 },
  /** Webhook 灌邮件：每 IP 500 次 / 分钟（CF Worker 入口一个 IP） */
  TEMPMAIL_INBOUND: { max: 500, windowMs: 60_000 },
  /** 翻译接口：每 IP 30 次 / 分钟（前端 debounce 500ms，正常输入不会触顶） */
  TRANSLATE: { max: 30, windowMs: 60_000 },
  /** TG webhook：每 IP 120 次 / 分钟（来源是 Telegram 服务器） */
  TGBOT_WEBHOOK: { max: 120, windowMs: 60_000 },
};
