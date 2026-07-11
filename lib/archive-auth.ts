import { getSession } from './session';

/**
 * 收藏箱访问授权：admin 登录态直接放行，否则看解锁授权是否在有效期内
 * （TG 一次性码 / TOTP 验证通过后写入 session.archiveUnlockedUntil）。
 */
export async function hasArchiveAccess(): Promise<boolean> {
  const s = await getSession();
  if (s.admin) return true;
  return !!(s.archiveUnlockedUntil && s.archiveUnlockedUntil > Date.now());
}
