/**
 * 工具元数据（纯数据，服务端/客户端都能 import）。
 * 新增工具：在这里加一项 + 在 lib/tools-components.ts 加 dynamic import +
 * 在 tools/{slug}/ 目录下写组件。
 */
export const TOOLS_META = {
  totp: {
    defaultName: 'TOTP / 2FA',
    defaultIcon: 'shield-check',
    defaultGroup: '安全',
  },
  notepad: {
    defaultName: '匿名笔记',
    defaultIcon: 'notebook-pen',
    defaultGroup: '匿名',
  },
  send: {
    defaultName: '匿名文件',
    defaultIcon: 'file-lock-2',
    defaultGroup: '匿名',
  },
  tempmail: {
    defaultName: '临时邮箱',
    defaultIcon: 'mail',
    defaultGroup: '匿名',
  },
  faker: {
    defaultName: '身份生成',
    defaultIcon: 'user-round',
    defaultGroup: '生成',
  },
  password: {
    defaultName: '密码生成',
    defaultIcon: 'key-round',
    defaultGroup: '生成',
  },
  encode: {
    defaultName: '编码工具',
    defaultIcon: 'code-2',
    defaultGroup: '工具',
  },
  chinese: {
    defaultName: '中文转换',
    defaultIcon: 'languages',
    defaultGroup: '工具',
  },
  qrcode: {
    defaultName: '二维码生成',
    defaultIcon: 'qr-code',
    defaultGroup: '工具',
  },
} as const;

export type ToolSlug = keyof typeof TOOLS_META;

export function isToolSlug(s: string): s is ToolSlug {
  return Object.prototype.hasOwnProperty.call(TOOLS_META, s);
}
