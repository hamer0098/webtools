/**
 * In-memory IP 限流：固定窗口算法。单容器场景够用。
 * 多实例部署要换 Redis（自用 VPS 不需要）。
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// 周期清扫过期 bucket，避免 map 无限增长
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, 60_000).unref?.();
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
};

export function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, retryAfterSec: 0 };
  }
  if (bucket.count >= max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  bucket.count++;
  return { ok: true, remaining: max - bucket.count, retryAfterSec: 0 };
}

/** 从 Request 提取 IP（处理反向代理） */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** 标准 429 响应（JSON + Retry-After 头） */
export function rateLimitResponse(retryAfterSec: number) {
  return new Response(
    JSON.stringify({ error: '请求过于频繁', retryAfter: retryAfterSec }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}
