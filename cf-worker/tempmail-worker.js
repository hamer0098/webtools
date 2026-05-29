// Cloudflare Email Worker —— 接收发往配置域名的所有邮件，
// 解析后通过 webhook 推给 webtools 的 /api/tempmail/inbound。
//
// 部署见同目录 README.md。
//
// 依赖：postal-mime（CF Workers 上 npm 包会被 bundler 自动打进去）。

import PostalMime from 'postal-mime';

const MAX_RAW_BYTES = 5 * 1024 * 1024; // 5 MB，再大就拒收，避免 Worker 内存爆

export default {
  /**
   * @param {ForwardableEmailMessage} message
   * @param {{ WEBTOOLS_URL: string, WEBHOOK_SECRET: string }} env
   */
  async email(message, env) {
    if (!env.WEBTOOLS_URL || !env.WEBHOOK_SECRET) {
      console.error('[tempmail-worker] missing env WEBTOOLS_URL / WEBHOOK_SECRET');
      message.setReject('Worker not configured');
      return;
    }

    const rawSize = Number(message.rawSize) || 0;
    if (rawSize > MAX_RAW_BYTES) {
      message.setReject('Message too large');
      return;
    }

    let parsed;
    try {
      const raw = await streamToUint8Array(message.raw);
      parsed = await PostalMime.parse(raw);
    } catch (err) {
      console.error('[tempmail-worker] parse failed', err);
      message.setReject('Parse failed');
      return;
    }

    const payload = {
      to: message.to,
      from: parsed.from?.address || message.from,
      fromName: parsed.from?.name || null,
      subject: parsed.subject || null,
      text: parsed.text || null,
      html: parsed.html || null,
    };

    try {
      const r = await fetch(
        env.WEBTOOLS_URL.replace(/\/$/, '') + '/api/tempmail/inbound',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': env.WEBHOOK_SECRET,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.error('[tempmail-worker] webhook non-2xx', r.status, text);
        // 不 setReject —— 让发件方以为送达了，避免暴露我们的过滤规则；
        // 失败邮件就丢弃（临时邮箱场景可接受）。
      }
    } catch (err) {
      console.error('[tempmail-worker] webhook fetch failed', err);
    }
  },
};

async function streamToUint8Array(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total > MAX_RAW_BYTES) throw new Error('stream exceeds max size');
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
