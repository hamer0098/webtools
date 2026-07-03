'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fakerEN,
  fakerEN_US,
  fakerEN_GB,
  fakerEN_CA,
  fakerEN_AU,
  fakerZH_CN,
  fakerZH_TW,
  fakerJA,
  fakerKO,
  fakerDE,
  fakerFR,
  fakerIT,
  fakerES,
  fakerRU,
  type Faker,
} from '@faker-js/faker';
import QRCode from 'qrcode';
import {
  Copy,
  RefreshCw,
  MapPin,
  QrCode,
  FileJson,
  Layers,
  History,
  X,
  Check,
  Download,
  Trash2,
} from 'lucide-react';
import { genCnAddress, genCnFullName, genCnMobile } from '@/lib/faker-cn-data';
import { genPhone, genZipCode } from '@/lib/faker-country-formats';
import { GENDER_LABELS, COUNTRY_NAMES } from '@/lib/faker-i18n';
import { toTraditional } from '@/lib/zh-conv';
import {
  toText,
  toJson,
  toCsv,
  toVCard,
  downloadFile,
  type ExportIdentity,
} from '@/lib/faker-export';
import type { CountryKey, LocaleKey } from './types';

// ---------- 配置 ----------

const LOCALES: Record<LocaleKey, { label: string; faker: Faker }> = {
  zh_CN: { label: '简体', faker: fakerZH_CN },
  zh_TW: { label: '繁体', faker: fakerZH_TW },
  en: { label: '英文', faker: fakerEN },
  ja: { label: '日文', faker: fakerJA },
  ko: { label: '韩文', faker: fakerKO },
  ru: { label: '俄文', faker: fakerRU },
};

const COUNTRIES: Record<CountryKey, { label: string; faker: Faker }> = {
  US: { label: '🇺🇸 美国', faker: fakerEN_US },
  GB: { label: '🇬🇧 英国', faker: fakerEN_GB },
  CA: { label: '🇨🇦 加拿大', faker: fakerEN_CA },
  AU: { label: '🇦🇺 澳大利亚', faker: fakerEN_AU },
  CN: { label: '🇨🇳 中国', faker: fakerZH_CN },
  TW: { label: '🇹🇼 台湾', faker: fakerZH_TW },
  JP: { label: '🇯🇵 日本', faker: fakerJA },
  KR: { label: '🇰🇷 韩国', faker: fakerKO },
  DE: { label: '🇩🇪 德国', faker: fakerDE },
  FR: { label: '🇫🇷 法国', faker: fakerFR },
  IT: { label: '🇮🇹 意大利', faker: fakerIT },
  ES: { label: '🇪🇸 西班牙', faker: fakerES },
  RU: { label: '🇷🇺 俄罗斯', faker: fakerRU },
};

// ---------- 类型 ----------

type LanguagePart = {
  fullName: string;
  firstName: string;
  lastName: string;
  sex: 'male' | 'female';
  birthdate: string;
  email: string;
  username: string;
  password: string;
  company: string;
  jobTitle: string;
  avatarSeed: string; // 用于头像 URL 的稳定 seed
};

type AddressData =
  | {
      kind: 'cn';
      zh: { streetAddress: string; city: string; state: string };
      en: { streetAddress: string; city: string; state: string };
      lat: number;
      lng: number;
    }
  | {
      kind: 'other';
      streetAddress: string;
      city: string;
      state: string;
    };

type CountryPart = {
  countryCode: CountryKey;
  phone: string;
  zipCode: string;
  address: AddressData;
  idNumber: string;
  idType: string;
  creditCardNumber: string;
  creditCardCVV: string;
  creditCardExpiry: string;
  creditCardIssuer: string;
};

// ---------- 生成器 ----------

function generateLanguagePart(locale: LocaleKey, faker: Faker): LanguagePart {
  const sex = faker.person.sex() as 'male' | 'female';

  let firstName: string, lastName: string, fullName: string;
  if (locale === 'zh_CN') {
    const n = genCnFullName(Math.random, sex);
    firstName = n.firstName;
    lastName = n.lastName;
    fullName = n.fullName;
  } else {
    firstName = faker.person.firstName(sex);
    lastName = faker.person.lastName(sex);
    fullName =
      locale === 'zh_TW' || locale === 'ja' || locale === 'ko'
        ? faker.person.fullName({ sex })
        : `${firstName} ${lastName}`;
  }

  const isLatin = locale === 'en';
  const username = isLatin
    ? faker.internet.userName({ firstName, lastName }).toLowerCase()
    : fakerEN.internet.userName().toLowerCase();
  const email = isLatin
    ? faker.internet.email({ firstName, lastName }).toLowerCase()
    : `${username}@${fakerEN.internet.domainName()}`;

  return {
    fullName,
    firstName,
    lastName,
    sex,
    birthdate: faker.date
      .birthdate({ mode: 'age', min: 18, max: 70 })
      .toISOString()
      .slice(0, 10),
    email,
    username,
    password: fakerEN.internet.password({ length: 14, memorable: false }),
    company: faker.company.name(),
    jobTitle: faker.person.jobTitle(),
    avatarSeed: `${username}-${sex}-${Math.floor(Math.random() * 1e6)}`,
  };
}

function generateIdNumber(country: CountryKey, faker: Faker): { id: string; type: string } {
  switch (country) {
    case 'US':
      return { id: faker.helpers.fromRegExp(/[0-9]{3}-[0-9]{2}-[0-9]{4}/), type: 'SSN' };
    case 'CN': {
      const region = faker.helpers.fromRegExp(/[1-6][0-9]{5}/);
      const year = faker.number.int({ min: 1950, max: 2005 }).toString();
      const month = faker.number.int({ min: 1, max: 12 }).toString().padStart(2, '0');
      const day = faker.number.int({ min: 1, max: 28 }).toString().padStart(2, '0');
      const seq = faker.helpers.fromRegExp(/[0-9]{3}/);
      const check = faker.helpers.fromRegExp(/[0-9X]/);
      return { id: `${region}${year}${month}${day}${seq}${check}`, type: '身份证' };
    }
    case 'TW':
      return { id: faker.helpers.fromRegExp(/[A-Z][12][0-9]{8}/), type: '身份证' };
    case 'GB':
      return { id: faker.helpers.fromRegExp(/[A-Z]{2}[0-9]{6}[A-D]/), type: 'NI' };
    case 'JP':
      return { id: faker.helpers.fromRegExp(/[0-9]{12}/), type: 'My Number' };
    case 'KR':
      return { id: faker.helpers.fromRegExp(/[0-9]{6}-[1-4][0-9]{6}/), type: '주민등록번호' };
    case 'DE':
      return { id: faker.helpers.fromRegExp(/[0-9]{11}/), type: 'Steuer-ID' };
    case 'FR':
      return { id: faker.helpers.fromRegExp(/[12][0-9]{14}/), type: 'INSEE' };
    case 'IT':
      return {
        id: faker.helpers.fromRegExp(/[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]/),
        type: 'Codice Fiscale',
      };
    case 'ES':
      return { id: faker.helpers.fromRegExp(/[0-9]{8}[A-Z]/), type: 'DNI' };
    case 'RU':
      return { id: faker.helpers.fromRegExp(/[0-9]{4} [0-9]{6}/), type: 'Passport' };
    case 'CA':
      return { id: faker.helpers.fromRegExp(/[0-9]{3}-[0-9]{3}-[0-9]{3}/), type: 'SIN' };
    case 'AU':
      return { id: faker.helpers.fromRegExp(/[0-9]{9}/), type: 'TFN' };
    default:
      return { id: faker.helpers.fromRegExp(/[0-9]{9}/), type: 'ID' };
  }
}

function generateCountryPart(country: CountryKey, faker: Faker): CountryPart {
  let address: AddressData;
  let zipCode: string;

  if (country === 'CN') {
    const a = genCnAddress(Math.random);
    address = { kind: 'cn', zh: a.zh, en: a.en, lat: a.lat, lng: a.lng };
    zipCode = a.zipCode;
  } else {
    address = {
      kind: 'other',
      streetAddress: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
    };
    zipCode = genZipCode(country, Math.random);
  }

  const phone = country === 'CN' ? genCnMobile(Math.random) : genPhone(country, Math.random);
  const { id: idNumber, type: idType } = generateIdNumber(country, faker);
  const exp = faker.date.future({ years: 5 });
  const creditCardExpiry =
    String(exp.getMonth() + 1).padStart(2, '0') + '/' + String(exp.getFullYear()).slice(-2);

  return {
    countryCode: country,
    phone,
    zipCode,
    address,
    idNumber,
    idType,
    creditCardNumber: faker.finance.creditCardNumber(),
    creditCardCVV: faker.finance.creditCardCVV(),
    creditCardExpiry,
    creditCardIssuer: faker.finance.creditCardIssuer(),
  };
}

function renderAddress(addr: AddressData, locale: LocaleKey) {
  if (addr.kind === 'cn') {
    if (locale === 'en') return addr.en;
    if (locale === 'zh_TW') {
      return {
        streetAddress: toTraditional(addr.zh.streetAddress),
        city: toTraditional(addr.zh.city),
        state: toTraditional(addr.zh.state),
      };
    }
    return addr.zh;
  }
  return { streetAddress: addr.streetAddress, city: addr.city, state: addr.state };
}

function formatFullAddress(
  addr: { streetAddress: string; city: string; state: string },
  countryName: string,
  locale: LocaleKey,
): string {
  if (locale === 'en') {
    return `${addr.streetAddress}, ${addr.city}, ${addr.state}, ${countryName}`;
  }
  return `${countryName} ${addr.state} ${addr.city} ${addr.streetAddress}`;
}

function mapsUrl(lat: number | undefined, lng: number | undefined, fullAddress: string) {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
}

function avatarUrl(seed: string) {
  // dicebear API：本地无需依赖，外网快。如果离线/不想外联可换 micah/lorelei/avataaars 等
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
}

// 把 langPart + countryPart 合并成扁平 ExportIdentity（用于复制/导出/历史）
function toExportIdentity(
  lang: LanguagePart,
  ctry: CountryPart,
  locale: LocaleKey,
): ExportIdentity {
  const addr = renderAddress(ctry.address, locale);
  const countryName = COUNTRY_NAMES[ctry.countryCode][locale];
  const fullAddress = formatFullAddress(addr, countryName, locale);
  const out: ExportIdentity = {
    fullName: lang.fullName,
    firstName: lang.firstName,
    lastName: lang.lastName,
    gender: GENDER_LABELS[locale][lang.sex],
    birthdate: lang.birthdate,
    idType: ctry.idType,
    idNumber: ctry.idNumber,
    email: lang.email,
    username: lang.username,
    password: lang.password,
    phone: ctry.phone,
    streetAddress: addr.streetAddress,
    city: addr.city,
    state: addr.state,
    zipCode: ctry.zipCode,
    country: countryName,
    fullAddress,
    company: lang.company,
    jobTitle: lang.jobTitle,
    creditCardNumber: ctry.creditCardNumber,
    creditCardCVV: ctry.creditCardCVV,
    creditCardExpiry: ctry.creditCardExpiry,
    creditCardIssuer: ctry.creditCardIssuer,
  };
  if (ctry.address.kind === 'cn') {
    out.lat = ctry.address.lat;
    out.lng = ctry.address.lng;
  }
  return out;
}

// ---------- 历史 ----------

const HISTORY_KEY = 'webtools.faker.history.v1';
const MAX_HISTORY = 20;

type HistoryItem = { id: ExportIdentity; ts: number };

function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function pushHistory(id: ExportIdentity) {
  const list = loadHistory();
  list.unshift({ id, ts: Date.now() });
  list.length = Math.min(list.length, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

// ---------- 主组件 ----------

export default function FakerTool() {
  const [locale, setLocale] = useState<LocaleKey>('zh_CN');
  const [country, setCountry] = useState<CountryKey>('CN');
  const [langPart, setLangPart] = useState<LanguagePart | null>(null);
  const [countryPart, setCountryPart] = useState<CountryPart | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    setLangPart(generateLanguagePart(locale, LOCALES[locale].faker));
  }, [locale]);

  useEffect(() => {
    setCountryPart(generateCountryPart(country, COUNTRIES[country].faker));
  }, [country]);

  // 当语言/国家切换或重新生成后，把当前 identity 入历史（去重避免重复入）
  useEffect(() => {
    if (!langPart || !countryPart) return;
    const id = toExportIdentity(langPart, countryPart, locale);
    const key = `${id.fullName}|${id.phone}|${id.email}`;
    if (key !== lastSavedRef.current) {
      lastSavedRef.current = key;
      pushHistory(id);
    }
  }, [langPart, countryPart, locale]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  };

  const regen = () => {
    setLangPart(generateLanguagePart(locale, LOCALES[locale].faker));
    setCountryPart(generateCountryPart(country, COUNTRIES[country].faker));
    setShowQr(false);
  };

  const copyAllText = async () => {
    if (!langPart || !countryPart) return;
    const id = toExportIdentity(langPart, countryPart, locale);
    await navigator.clipboard.writeText(toText(id));
    showToast('已复制为文本');
  };

  const copyJson = async () => {
    if (!langPart || !countryPart) return;
    const id = toExportIdentity(langPart, countryPart, locale);
    await navigator.clipboard.writeText(toJson(id));
    showToast('已复制 JSON');
  };

  if (!langPart || !countryPart) {
    return <div className="p-8 text-sm text-neutral-500">加载中…</div>;
  }

  const addr = renderAddress(countryPart.address, locale);
  const genderLabel = GENDER_LABELS[locale][langPart.sex];
  const countryName = COUNTRY_NAMES[countryPart.countryCode][locale];
  const fullAddress = formatFullAddress(addr, countryName, locale);
  const lat = countryPart.address.kind === 'cn' ? countryPart.address.lat : undefined;
  const lng = countryPart.address.kind === 'cn' ? countryPart.address.lng : undefined;
  const exportId = toExportIdentity(langPart, countryPart, locale);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">身份生成</h1>
            <p className="text-sm text-neutral-500">仅供测试用途，请勿用于非法目的</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocaleKey)}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
              title="语言（影响姓名/邮箱/性别等语言相关字段）"
            >
              {(Object.entries(LOCALES) as Array<[LocaleKey, (typeof LOCALES)[LocaleKey]]>).map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ),
              )}
            </select>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value as CountryKey)}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
              title="国家（影响地址/电话/身份号等国家相关字段）"
            >
              {(Object.entries(COUNTRIES) as Array<[CountryKey, (typeof COUNTRIES)[CountryKey]]>).map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ),
              )}
            </select>
            <button
              onClick={regen}
              className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              重新生成
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <ActionButton icon={<Copy className="h-3.5 w-3.5" />} onClick={copyAllText}>
            复制全部
          </ActionButton>
          <ActionButton icon={<FileJson className="h-3.5 w-3.5" />} onClick={copyJson}>
            复制 JSON
          </ActionButton>
          <ActionButton icon={<Layers className="h-3.5 w-3.5" />} onClick={() => setShowBulk(true)}>
            批量生成
          </ActionButton>
          <ActionButton icon={<History className="h-3.5 w-3.5" />} onClick={() => setShowHistory(true)}>
            历史
          </ActionButton>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="基本资料">
          <div className="mb-3 flex items-center gap-3">
            <img
              src={avatarUrl(langPart.avatarSeed)}
              alt="avatar"
              width={56}
              height={56}
              className="h-14 w-14 rounded-full border border-neutral-200 bg-white dark:border-neutral-700"
            />
            <div className="min-w-0">
              <div className="truncate text-base font-medium">{langPart.fullName}</div>
              <div className="text-xs text-neutral-500">
                {genderLabel} · {langPart.birthdate}
              </div>
            </div>
          </div>
          <FieldRow label="姓名" value={langPart.fullName} />
          <FieldRow label="名" value={langPart.firstName} />
          <FieldRow label="姓" value={langPart.lastName} />
          <FieldRow label="性别" value={genderLabel} />
          <FieldRow label="生日" value={langPart.birthdate} />
          <FieldRow label={countryPart.idType} value={countryPart.idNumber} />
        </Card>

        <Card title="联系方式">
          <FieldRow label="邮箱" value={langPart.email} />
          <FieldRow label="用户名" value={langPart.username} />
          <FieldRow label="密码" value={langPart.password} />
          <FieldRow label="电话" value={countryPart.phone} />
          <div className="pt-2">
            <button
              onClick={() => setShowQr((v) => !v)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <QrCode className="h-3.5 w-3.5" />
              {showQr ? '收起 vCard 二维码' : '显示 vCard 二维码'}
            </button>
            {showQr && <VCardQr identity={exportId} />}
          </div>
        </Card>

        <Card title="地址">
          <FieldRow label="街道" value={addr.streetAddress} />
          <FieldRow label="城市" value={addr.city} />
          <FieldRow label="州/省" value={addr.state} />
          <FieldRow label="邮编" value={countryPart.zipCode} />
          <FieldRow label="国家" value={countryName} />
          <FieldRow label="完整地址" value={fullAddress} />
          {lat != null && lng != null && (
            <FieldRow label="经纬度" value={`${lat.toFixed(4)}, ${lng.toFixed(4)}`} />
          )}
          <div className="pt-2">
            <a
              href={mapsUrl(lat, lng, fullAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <MapPin className="h-3.5 w-3.5" />
              在 Google Maps 中打开
            </a>
          </div>
        </Card>

        <Card title="工作与金融">
          <FieldRow label="公司" value={langPart.company} />
          <FieldRow label="职位" value={langPart.jobTitle} />
          <FieldRow label="信用卡号" value={countryPart.creditCardNumber} />
          <FieldRow label="CVV" value={countryPart.creditCardCVV} />
          <FieldRow label="到期时间" value={countryPart.creditCardExpiry} />
          <FieldRow label="发卡组织" value={countryPart.creditCardIssuer} />
        </Card>
      </div>

      {showBulk && (
        <BulkModal
          locale={locale}
          country={country}
          onClose={() => setShowBulk(false)}
        />
      )}
      {showHistory && (
        <HistoryDrawer
          onClose={() => setShowHistory(false)}
          onRestore={(id) => {
            // 历史里取出的是已扁平化的 exportIdentity，提示用户切回对应国家/语言
            showToast('已复制选中的 JSON');
            navigator.clipboard.writeText(toJson(id));
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900">
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------- 子组件 ----------

function ActionButton({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded border border-neutral-300 bg-white px-2.5 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
    >
      {icon}
      {children}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        {title}
      </h3>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="w-20 shrink-0 text-xs text-neutral-500">{label}</dt>
      <dd className="flex-1 truncate font-mono text-sm" title={value}>
        {value}
      </dd>
      <button
        onClick={copy}
        className="shrink-0 text-neutral-400 hover:text-blue-600"
        title="复制"
      >
        {copied ? (
          <span className="text-xs text-green-600">已复制</span>
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function VCardQr({ identity }: { identity: ExportIdentity }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const vcard = toVCard(identity);
    QRCode.toDataURL(vcard, { margin: 1, width: 200 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || '生成失败');
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  return (
    <div className="mt-2 flex flex-col items-center gap-2 rounded border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
      {error && <div className="text-xs text-red-600">{error}</div>}
      {dataUrl && (
        <>
          <img src={dataUrl} alt="vCard QR" width={200} height={200} />
          <p className="text-center text-xs text-neutral-500">
            用手机扫一扫可直接保存到通讯录
          </p>
        </>
      )}
      {!dataUrl && !error && <div className="text-xs text-neutral-500">生成中…</div>}
    </div>
  );
}

// ---------- 批量生成 ----------

function BulkModal({
  locale,
  country,
  onClose,
}: {
  locale: LocaleKey;
  country: CountryKey;
  onClose: () => void;
}) {
  const [count, setCount] = useState(10);
  const [format, setFormat] = useState<'json' | 'csv'>('csv');
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (count < 1 || count > 200) return;
    setRunning(true);
    // 同步循环生成，量不大不需要 worker
    const ids: ExportIdentity[] = [];
    for (let i = 0; i < count; i++) {
      const lang = generateLanguagePart(locale, LOCALES[locale].faker);
      const ctry = generateCountryPart(country, COUNTRIES[country].faker);
      ids.push(toExportIdentity(lang, ctry, locale));
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'csv') {
      downloadFile(toCsv(ids), `identities-${stamp}.csv`, 'text/csv;charset=utf-8;');
    } else {
      downloadFile(JSON.stringify(ids, null, 2), `identities-${stamp}.json`, 'application/json');
    }
    setRunning(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">批量生成</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          按当前选中的语言（{LOCALES[locale].label}）和国家（{COUNTRIES[country].label}）批量生成。
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">数量（1-200）</span>
          <input
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(e) => setCount(Math.min(200, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            className="w-32 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
        <div className="mt-3">
          <span className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">导出格式</span>
          <div className="flex gap-2">
            <FormatRadio active={format === 'csv'} onClick={() => setFormat('csv')}>
              CSV
            </FormatRadio>
            <FormatRadio active={format === 'json'} onClick={() => setFormat('json')}>
              JSON
            </FormatRadio>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {running ? '生成中…' : '生成并下载'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormatRadio({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm ${
        active
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
  );
}

// ---------- 历史侧栏 ----------

function HistoryDrawer({
  onClose,
  onRestore,
}: {
  onClose: () => void;
  onRestore: (id: ExportIdentity) => void;
}) {
  const [items, setItems] = useState<HistoryItem[]>(() => loadHistory());

  const exportAll = () => {
    if (items.length === 0) return;
    const ids = items.map((i) => i.id);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(JSON.stringify(ids, null, 2), `history-${stamp}.json`, 'application/json');
  };

  const clearAll = () => {
    if (!confirm('清空全部历史？')) return;
    clearHistory();
    setItems([]);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="font-semibold">历史（最近 {MAX_HISTORY} 条）</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2 text-xs dark:border-neutral-800">
          <button
            onClick={exportAll}
            disabled={items.length === 0}
            className="flex items-center gap-1 rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <Download className="h-3 w-3" /> 导出全部 JSON
          </button>
          <button
            onClick={clearAll}
            disabled={items.length === 0}
            className="flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:hover:bg-red-950"
          >
            <Trash2 className="h-3 w-3" /> 清空
          </button>
          <span className="ml-auto text-neutral-500">共 {items.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">还没有历史记录</div>
          ) : (
            <ul>
              {items.map((it, idx) => (
                <li
                  key={idx}
                  className="border-b border-neutral-100 px-4 py-3 dark:border-neutral-800"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={avatarUrl(`${it.id.username}-${it.id.gender}`)}
                      alt=""
                      className="h-10 w-10 rounded-full border border-neutral-200 bg-white dark:border-neutral-700"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.id.fullName}</div>
                      <div className="truncate text-xs text-neutral-500">
                        {it.id.country} · {it.id.phone}
                      </div>
                      <div className="text-xs text-neutral-400">{fmtTime(it.ts)}</div>
                    </div>
                    <button
                      onClick={() => onRestore(it.id)}
                      title="复制 JSON"
                      className="text-neutral-400 hover:text-blue-600"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
