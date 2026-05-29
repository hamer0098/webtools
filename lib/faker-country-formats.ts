/**
 * 各国手机号 / 邮编 的真实格式生成器。
 * fakerJS 各 locale 的 phone.number() 经常返回不规范字符串（甚至带 #），
 * zipCode() 也不一定是该国真实格式，所以这里按真实规则覆盖。
 */

import type { CountryKey } from '@/tools/faker/types';

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}
function randInt(min: number, max: number, rand: () => number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function digits(len: number, rand: () => number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += randInt(0, 9, rand);
  return s;
}
function letters(len: number, rand: () => number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'): string {
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[randInt(0, alphabet.length - 1, rand)];
  return s;
}
function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

// ---------- 手机号 ----------

export function genPhone(country: CountryKey, rand: () => number): string {
  switch (country) {
    case 'US':
    case 'CA':
      // (NXX) NXX-XXXX，N 是 2-9
      return `(${randInt(2, 9, rand)}${digits(2, rand)}) ${randInt(2, 9, rand)}${digits(2, rand)}-${digits(4, rand)}`;
    case 'GB':
      // +44 7xxx xxxxxx
      return `+44 7${digits(3, rand)} ${digits(6, rand)}`;
    case 'AU':
      // +61 4xx xxx xxx
      return `+61 4${digits(2, rand)} ${digits(3, rand)} ${digits(3, rand)}`;
    case 'TW': {
      // 09xx-xxx-xxx
      return `09${digits(2, rand)}-${digits(3, rand)}-${digits(3, rand)}`;
    }
    case 'JP': {
      // 090-xxxx-xxxx 或 080-xxxx-xxxx
      const prefix = pick(['090', '080', '070'], rand);
      return `${prefix}-${digits(4, rand)}-${digits(4, rand)}`;
    }
    case 'KR':
      // 010-xxxx-xxxx
      return `010-${digits(4, rand)}-${digits(4, rand)}`;
    case 'DE':
      // +49 1xx xxxxxxx（移动）
      return `+49 1${digits(2, rand)} ${digits(7, rand)}`;
    case 'FR':
      // +33 6 xx xx xx xx 或 +33 7 ...
      return `+33 ${pick(['6', '7'], rand)} ${digits(2, rand)} ${digits(2, rand)} ${digits(2, rand)} ${digits(2, rand)}`;
    case 'IT':
      // +39 3xx xxx xxxx
      return `+39 3${digits(2, rand)} ${digits(3, rand)} ${digits(4, rand)}`;
    case 'ES':
      // +34 6xx xxx xxx 或 +34 7xx ...
      return `+34 ${pick(['6', '7'], rand)}${digits(2, rand)} ${digits(3, rand)} ${digits(3, rand)}`;
    case 'RU':
      // +7 9xx xxx-xx-xx
      return `+7 9${digits(2, rand)} ${digits(3, rand)}-${digits(2, rand)}-${digits(2, rand)}`;
    default:
      return digits(10, rand);
  }
}

// ---------- 邮编 ----------

export function genZipCode(country: CountryKey, rand: () => number): string {
  switch (country) {
    case 'US':
      return digits(5, rand);
    case 'CA': {
      // A1A 1A1（首字母不用 D、F、I、O、Q、U、W、Z）
      const firstAlpha = 'ABCEGHJKLMNPRSTVXY';
      const restAlpha = 'ABCEGHJKLMNPRSTVWXYZ';
      return `${letters(1, rand, firstAlpha)}${digits(1, rand)}${letters(1, rand, restAlpha)} ${digits(1, rand)}${letters(1, rand, restAlpha)}${digits(1, rand)}`;
    }
    case 'GB': {
      // SW1A 1AA / EC1A 1BB / M1 1AA / B33 8TH 等 —— 用一个最常见的样式
      const areas = ['SW', 'NW', 'SE', 'NE', 'W', 'E', 'N', 'EC', 'WC', 'M', 'B', 'L', 'CV'];
      const area = pick(areas, rand);
      return `${area}${randInt(1, 99, rand)} ${randInt(1, 9, rand)}${letters(2, rand)}`;
    }
    case 'AU':
      return digits(4, rand);
    case 'TW':
      return digits(5, rand);
    case 'JP':
      return `${digits(3, rand)}-${digits(4, rand)}`;
    case 'KR':
      return digits(5, rand);
    case 'DE':
    case 'FR':
    case 'IT':
    case 'ES':
      return digits(5, rand);
    case 'RU':
      return digits(6, rand);
    default:
      return digits(5, rand);
  }
}
