import { getDb } from './db';

function getClientInfo(req: Request): { ip: string; userAgent: string } {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  return { ip, userAgent };
}

export function logEvent(
  event: string,
  req: Request | null,
  detail?: Record<string, unknown> | null,
) {
  const info = req ? getClientInfo(req) : { ip: 'system', userAgent: 'system' };
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log (event, detail, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        event,
        detail ? JSON.stringify(detail) : null,
        info.ip,
        info.userAgent,
        Date.now(),
      );
  } catch (e) {
    console.error('[audit] failed to log event', event, e);
  }
}

export const AUDIT_EVENTS = {
  AUTH_LOGIN_OK: 'auth.login.success',
  AUTH_LOGIN_FAIL: 'auth.login.fail',
  AUTH_2FA_OK: 'auth.2fa.success',
  AUTH_2FA_FAIL: 'auth.2fa.fail',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PWD_CHANGED: 'auth.password.changed',
  AUTH_2FA_ENABLED: 'auth.2fa.enabled',
  AUTH_2FA_DISABLED: 'auth.2fa.disabled',
  TOOL_UPDATE: 'tool.update',
  TOOL_DELETE: 'tool.delete',
  NOTE_DELETE: 'note.delete',
  NOTE_DELETE_BATCH: 'note.delete.batch',
  NOTE_CLEANUP: 'note.cleanup',
  AUDIT_CLEANUP: 'audit.cleanup',
  RATE_LIMITED: 'rate.limited',
  NOTE_REJECTED: 'note.rejected',
  SEND_AUTH_OK: 'send.auth.ok',
  SEND_AUTH_FAIL: 'send.auth.fail',
  SEND_UPLOAD: 'send.upload',
  SEND_DOWNLOAD: 'send.download',
  SEND_DELETE: 'send.delete',
  SEND_CLEANUP: 'send.cleanup',
  SEND_CODE_CREATE: 'send.code.create',
  SEND_CODE_DELETE: 'send.code.delete',
  TEMPMAIL_CREATE: 'tempmail.create',
  TEMPMAIL_UPDATE: 'tempmail.update',
  TEMPMAIL_DELETE: 'tempmail.delete',
  TEMPMAIL_INBOUND: 'tempmail.inbound',
  TEMPMAIL_INBOUND_REJECT: 'tempmail.inbound.reject',
  TEMPMAIL_MESSAGE_DELETE: 'tempmail.message.delete',
  TEMPMAIL_CLEANUP: 'tempmail.cleanup',
} as const;
