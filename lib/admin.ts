import { TOTP, Secret } from 'otpauth';
import { getDb, type AdminUserRow } from './db';
import { hashPassword, verifyPassword } from './utils/password';

const ADMIN_ID = 1;

export function getAdminUser(): AdminUserRow | null {
  return (
    (getDb().prepare('SELECT * FROM admin_user WHERE id = ?').get(ADMIN_ID) as
      | AdminUserRow
      | undefined) || null
  );
}

/**
 * 首次启动时，从 env 的 ADMIN_USERNAME + ADMIN_PASSWORD_HASH 引导出管理员账号。
 * 后续修改密码/启用 2FA 都在 DB 里走，env 不再被读取。
 */
export function bootstrapAdminFromEnv(): { bootstrapped: boolean; error?: string } {
  const existing = getAdminUser();
  if (existing) return { bootstrapped: false };

  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!username || !passwordHash) {
    return {
      bootstrapped: false,
      error: '未配置 ADMIN_USERNAME / ADMIN_PASSWORD_HASH，无法初始化管理员',
    };
  }

  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO admin_user (id, username, password_hash, totp_secret, totp_pending, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
    )
    .run(ADMIN_ID, username, passwordHash, now, now);
  return { bootstrapped: true };
}

export async function updateAdminPassword(newPlain: string): Promise<void> {
  const hash = await hashPassword(newPlain);
  getDb()
    .prepare('UPDATE admin_user SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hash, Date.now(), ADMIN_ID);
}

export async function verifyAdminPassword(plain: string): Promise<boolean> {
  const user = getAdminUser();
  if (!user) return false;
  return verifyPassword(user.password_hash, plain);
}

export function generatePending2faSecret(username: string): {
  secret: string;
  uri: string;
} {
  const secret = new Secret({ size: 20 });
  const base32 = secret.base32;
  getDb()
    .prepare('UPDATE admin_user SET totp_pending = ?, updated_at = ? WHERE id = ?')
    .run(base32, Date.now(), ADMIN_ID);
  const totp = new TOTP({
    issuer: 'Webtools',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
  return { secret: base32, uri: totp.toString() };
}

export function verifyTotp(secret: string, code: string): boolean {
  try {
    const totp = new TOTP({
      issuer: 'Webtools',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code.replace(/\s+/g, ''), window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

export function enable2fa(code: string): boolean {
  const user = getAdminUser();
  if (!user || !user.totp_pending) return false;
  if (!verifyTotp(user.totp_pending, code)) return false;
  getDb()
    .prepare(
      'UPDATE admin_user SET totp_secret = totp_pending, totp_pending = NULL, updated_at = ? WHERE id = ?',
    )
    .run(Date.now(), ADMIN_ID);
  return true;
}

export function disable2fa(): void {
  getDb()
    .prepare(
      'UPDATE admin_user SET totp_secret = NULL, totp_pending = NULL, updated_at = ? WHERE id = ?',
    )
    .run(Date.now(), ADMIN_ID);
}

export function cancelPending2fa(): void {
  getDb()
    .prepare('UPDATE admin_user SET totp_pending = NULL, updated_at = ? WHERE id = ?')
    .run(Date.now(), ADMIN_ID);
}
