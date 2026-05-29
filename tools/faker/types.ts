// 共享类型，让 lib/ 下的辅助文件能 import 不形成循环
export type CountryKey =
  | 'US'
  | 'GB'
  | 'CA'
  | 'AU'
  | 'CN'
  | 'TW'
  | 'JP'
  | 'KR'
  | 'DE'
  | 'FR'
  | 'IT'
  | 'ES'
  | 'RU';

export type LocaleKey = 'zh_CN' | 'zh_TW' | 'en' | 'ja' | 'ko' | 'ru';
