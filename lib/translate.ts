/**
 * 翻译 provider 抽象。
 *
 * 默认 provider 是 `mock` —— 返回固定占位文本，方便开发期看 UI 效果。
 * 接入真 API 时：
 *   1) 在下面 PROVIDERS 注册新 provider 实现
 *   2) .env 设置 TRANSLATE_PROVIDER=<provider-id> 和该 provider 需要的 key
 *
 * 设计目标：所有 provider 共享同一个 TranslateInput / TranslateResult 形状，
 * 切换 provider 不影响前端代码。
 */

export type TranslateInput = {
  text: string;
  /** ISO 语言码，'auto' 表示让 provider 自动检测 */
  from?: string;
  to: string;
};

export type TranslateResult =
  | { ok: true; text: string; provider: string }
  | { ok: false; error: string };

/** 单次最大长度（防止滥用 / 触发上游限制） */
export const TRANSLATE_MAX_LEN = 2000;

type Provider = (input: TranslateInput) => Promise<TranslateResult>;

const PROVIDERS: Record<string, Provider> = {
  mock: translateMock,
  deeplx: translateDeepLX,
  // 其它 provider 在这里继续加，如：
  // baidu: translateBaidu,
  // deepl: translateDeepL,
};

export function getProviderId(): string {
  return (process.env.TRANSLATE_PROVIDER || 'mock').toLowerCase();
}

export async function translate(input: TranslateInput): Promise<TranslateResult> {
  if (!input.text.trim()) {
    return { ok: true, text: '', provider: 'noop' };
  }
  if (input.text.length > TRANSLATE_MAX_LEN) {
    return { ok: false, error: `单次最多 ${TRANSLATE_MAX_LEN} 字符` };
  }

  const id = getProviderId();
  const impl = PROVIDERS[id];
  if (!impl) {
    return {
      ok: false,
      error: `未知 provider "${id}"。当前已实现：${Object.keys(PROVIDERS).join(', ')}`,
    };
  }

  try {
    return await impl(input);
  } catch (e) {
    console.error('[translate] provider error', id, e);
    return { ok: false, error: '翻译失败：' + ((e as Error).message || 'unknown') };
  }
}

/* ---------------- Mock 实现 ---------------- */

async function translateMock(input: TranslateInput): Promise<TranslateResult> {
  // 模拟 250ms 网络延迟，让前端 loading 状态有展示机会
  await new Promise((r) => setTimeout(r, 250));
  const head = input.text.slice(0, 80);
  const ellipsis = input.text.length > 80 ? '…' : '';
  return {
    ok: true,
    text: `[mock → ${input.to}] ${head}${ellipsis}`,
    provider: 'mock',
  };
}

/* ---------------- DeepLX 实现 ---------------- */

/**
 * DeepLX 是 DeepL 第三方免费 API。协议：
 *   POST {endpoint}
 *   { "text": "...", "source_lang": "ZH"|"auto", "target_lang": "EN" }
 *   → { "code": 200, "data": "translated text", ... }
 *
 * 公开镜像（api.deeplx.org / deeplx.vercel.app 等）现在普遍不稳定或返回 troll
 * 内容，作者明确反对使用。建议自己去 https://deeplx.missuo.ru 用 GitHub 登录
 * 拿专属 endpoint，或部署一个 Cloudflare Workers 实例。
 *
 * env TRANSLATE_DEEPLX_URL 支持配置多个 URL（逗号分隔），主挂了顺次降级备用。
 */

const DEEPLX_TIMEOUT_MS = 8000;

async function translateDeepLX(input: TranslateInput): Promise<TranslateResult> {
  const raw = process.env.TRANSLATE_DEEPLX_URL?.trim();
  if (!raw) {
    return {
      ok: false,
      error:
        'DeepLX 未配置：请在 .env 设置 TRANSLATE_DEEPLX_URL=https://你的-endpoint/translate',
    };
  }
  const urls = raw
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  // DeepLX 用大写 ISO，'auto' 也支持
  const body = JSON.stringify({
    text: input.text,
    source_lang: (input.from || 'auto').toUpperCase(),
    target_lang: input.to.toUpperCase(),
  });

  const errors: string[] = [];
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), DEEPLX_TIMEOUT_MS);
      let r: Response;
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!r.ok) {
        errors.push(`${url} → HTTP ${r.status}`);
        continue;
      }
      const data = (await r.json().catch(() => null)) as
        | { code?: number; data?: string; message?: string }
        | null;
      if (!data || typeof data.data !== 'string' || data.code !== 200) {
        errors.push(`${url} → 响应格式错误：${JSON.stringify(data)?.slice(0, 80)}`);
        continue;
      }
      return { ok: true, text: data.data, provider: 'deeplx' };
    } catch (e) {
      const msg = (e as Error).name === 'AbortError'
        ? `超时 ${DEEPLX_TIMEOUT_MS}ms`
        : (e as Error).message || 'fetch failed';
      errors.push(`${url} → ${msg}`);
    }
  }
  return {
    ok: false,
    error: `所有 DeepLX endpoint 失败：\n${errors.join('\n')}`,
  };
}
