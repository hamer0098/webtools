/**
 * Identity → 文本 / JSON / CSV / vCard 序列化。
 */

export type ExportIdentity = {
  fullName: string;
  firstName: string;
  lastName: string;
  gender: string; // 已本地化字符串（男/Male 等）
  birthdate: string;
  idType: string;
  idNumber: string;
  email: string;
  username: string;
  password: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  fullAddress: string;
  company: string;
  jobTitle: string;
  creditCardNumber: string;
  creditCardCVV: string;
  creditCardExpiry: string;
  creditCardIssuer: string;
  lat?: number;
  lng?: number;
};

const ORDER: Array<[keyof ExportIdentity, string]> = [
  ['fullName', '姓名'],
  ['firstName', '名'],
  ['lastName', '姓'],
  ['gender', '性别'],
  ['birthdate', '生日'],
  ['idType', '身份号类型'],
  ['idNumber', '身份号'],
  ['email', '邮箱'],
  ['username', '用户名'],
  ['password', '密码'],
  ['phone', '电话'],
  ['streetAddress', '街道'],
  ['city', '城市'],
  ['state', '州/省'],
  ['zipCode', '邮编'],
  ['country', '国家'],
  ['fullAddress', '完整地址'],
  ['company', '公司'],
  ['jobTitle', '职位'],
  ['creditCardNumber', '信用卡号'],
  ['creditCardCVV', 'CVV'],
  ['creditCardExpiry', '到期时间'],
  ['creditCardIssuer', '发卡组织'],
];

/** 人类可读多行文本，适合 "复制全部" 后粘贴到笔记/聊天 */
export function toText(id: ExportIdentity): string {
  const lines = ORDER.map(([k, label]) => `${label}: ${id[k] ?? ''}`);
  if (id.lat != null && id.lng != null) lines.push(`经纬度: ${id.lat}, ${id.lng}`);
  return lines.join('\n');
}

/** 单条紧凑 JSON */
export function toJson(id: ExportIdentity): string {
  return JSON.stringify(id, null, 2);
}

/** CSV：第一行表头，每个 identity 一行 */
export function toCsv(ids: ExportIdentity[]): string {
  const fields: Array<keyof ExportIdentity> = ORDER.map(([k]) => k);
  fields.push('lat', 'lng');
  const header = fields.join(',');
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const rows = ids.map((id) => fields.map((f) => esc(id[f])).join(','));
  return [header, ...rows].join('\n');
}

/** vCard 3.0，可被通讯录 App / 二维码扫描器解析 */
export function toVCard(id: ExportIdentity): string {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(id.lastName)};${esc(id.firstName)};;;`,
    `FN:${esc(id.fullName)}`,
  ];
  if (id.phone) lines.push(`TEL;TYPE=CELL:${esc(id.phone)}`);
  if (id.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(id.email)}`);
  // ADR;TYPE=HOME:;;<street>;<city>;<state>;<zip>;<country>
  lines.push(
    `ADR;TYPE=HOME:;;${esc(id.streetAddress)};${esc(id.city)};${esc(id.state)};${esc(id.zipCode)};${esc(id.country)}`,
  );
  if (id.company) lines.push(`ORG:${esc(id.company)}`);
  if (id.jobTitle) lines.push(`TITLE:${esc(id.jobTitle)}`);
  if (id.birthdate) lines.push(`BDAY:${id.birthdate}`);
  if (id.lat != null && id.lng != null) lines.push(`GEO:${id.lat};${id.lng}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function esc(s: string): string {
  // vCard 转义：\, , ; \n
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

export function downloadFile(content: string, filename: string, mime: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
