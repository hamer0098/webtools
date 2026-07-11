import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type SessionData = {
  admin?: boolean;
  pre2fa?: boolean; // 密码通过、等待 2FA 验证的中间态
  unlockedNotes?: string[];
  /** 匿名文件上传授权：通过密码/邀请码验证后写入，含 codeId（onetime 在上传成功后才标记 used） */
  sendAuth?: {
    codeId: number;
    kind: 'permanent' | 'onetime';
    /** 授权过期时间戳；过期后必须重新输入 */
    expiresAt: number;
  };
  /** 收藏箱解锁授权（TG 一次性码 / TOTP 验证通过）：过期时间戳 */
  archiveUnlockedUntil?: number;
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'dev-only-secret-please-change-32-chars',
  cookieName: 'webtools_session',
  ttl: 60 * 60 * 24 * 7, // 7 天
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
};

export async function getSession() {
  const store = await cookies();
  return getIronSession<SessionData>(store, sessionOptions);
}

export async function requireAdmin() {
  const s = await getSession();
  if (!s.admin) return null;
  return s;
}
