/**
 * 跨 locale 的展示文字翻译：性别、国家名等。
 * 切换语言时，这些字段需要按当前 locale 翻译，而不重新生成数据。
 */

import type { CountryKey, LocaleKey } from '@/tools/faker/types';

export const GENDER_LABELS: Record<LocaleKey, { male: string; female: string }> = {
  zh_CN: { male: '男', female: '女' },
  zh_TW: { male: '男', female: '女' },
  en: { male: 'Male', female: 'Female' },
  ja: { male: '男', female: '女' },
  ko: { male: '남', female: '여' },
  ru: { male: 'Мужской', female: 'Женский' },
};

export const COUNTRY_NAMES: Record<CountryKey, Record<LocaleKey, string>> = {
  US: {
    zh_CN: '美国', zh_TW: '美國', en: 'United States',
    ja: 'アメリカ合衆国', ko: '미국', ru: 'США',
  },
  GB: {
    zh_CN: '英国', zh_TW: '英國', en: 'United Kingdom',
    ja: 'イギリス', ko: '영국', ru: 'Великобритания',
  },
  CA: {
    zh_CN: '加拿大', zh_TW: '加拿大', en: 'Canada',
    ja: 'カナダ', ko: '캐나다', ru: 'Канада',
  },
  AU: {
    zh_CN: '澳大利亚', zh_TW: '澳洲', en: 'Australia',
    ja: 'オーストラリア', ko: '호주', ru: 'Австралия',
  },
  CN: {
    zh_CN: '中国', zh_TW: '中國', en: 'China',
    ja: '中国', ko: '중국', ru: 'Китай',
  },
  TW: {
    zh_CN: '台湾', zh_TW: '臺灣', en: 'Taiwan',
    ja: '台湾', ko: '대만', ru: 'Тайвань',
  },
  JP: {
    zh_CN: '日本', zh_TW: '日本', en: 'Japan',
    ja: '日本', ko: '일본', ru: 'Япония',
  },
  KR: {
    zh_CN: '韩国', zh_TW: '韓國', en: 'South Korea',
    ja: '韓国', ko: '대한민국', ru: 'Южная Корея',
  },
  DE: {
    zh_CN: '德国', zh_TW: '德國', en: 'Germany',
    ja: 'ドイツ', ko: '독일', ru: 'Германия',
  },
  FR: {
    zh_CN: '法国', zh_TW: '法國', en: 'France',
    ja: 'フランス', ko: '프랑스', ru: 'Франция',
  },
  IT: {
    zh_CN: '意大利', zh_TW: '義大利', en: 'Italy',
    ja: 'イタリア', ko: '이탈리아', ru: 'Италия',
  },
  ES: {
    zh_CN: '西班牙', zh_TW: '西班牙', en: 'Spain',
    ja: 'スペイン', ko: '스페인', ru: 'Испания',
  },
  RU: {
    zh_CN: '俄罗斯', zh_TW: '俄羅斯', en: 'Russia',
    ja: 'ロシア', ko: '러시아', ru: 'Россия',
  },
};
