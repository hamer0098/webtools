'use client';

import { useEffect, useState } from 'react';
import { Copy, RefreshCw, KeyRound, MessageSquareText, AtSign } from 'lucide-react';
import clsx from 'clsx';
import { fakerEN } from '@faker-js/faker';

type Tab = 'password' | 'passphrase' | 'username';

export default function PasswordTool() {
  const [tab, setTab] = useState<Tab>('password');

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">密码生成</h1>
        <p className="text-sm text-neutral-500">
          全程在浏览器本地用 <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">crypto.getRandomValues</code> 生成，不会上传任何数据
        </p>
      </header>

      <div className="mb-5 inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-1 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <TabButton active={tab === 'password'} onClick={() => setTab('password')} icon={<KeyRound className="h-3.5 w-3.5" />}>
          Password
        </TabButton>
        <TabButton active={tab === 'passphrase'} onClick={() => setTab('passphrase')} icon={<MessageSquareText className="h-3.5 w-3.5" />}>
          Passphrase
        </TabButton>
        <TabButton active={tab === 'username'} onClick={() => setTab('username')} icon={<AtSign className="h-3.5 w-3.5" />}>
          Username
        </TabButton>
      </div>

      <div className="max-w-2xl">
        {tab === 'password' && <PasswordPanel />}
        {tab === 'passphrase' && <PassphrasePanel />}
        {tab === 'username' && <UsernamePanel />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors',
        active
          ? 'bg-white shadow-sm dark:bg-neutral-800'
          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------- 随机源 ----------

function secureRandInt(max: number): number {
  if (max <= 0) return 0;
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    // 排除模运算偏差
    const range = 0xffffffff;
    const limit = range - (range % max);
    const buf = new Uint32Array(1);
    let v: number;
    do {
      window.crypto.getRandomValues(buf);
      v = buf[0];
    } while (v >= limit);
    return v % max;
  }
  return Math.floor(Math.random() * max);
}

function pick<T>(arr: readonly T[]): T {
  return arr[secureRandInt(arr.length)];
}

function shuffleInPlace<T>(a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = secureRandInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// ---------- Password ----------

const SPECIAL_CHARS = '!@#$%^&*';
const AMBIGUOUS = new Set(['l', 'I', '1', '0', 'O', 'o']);

function buildAlphabet(opts: {
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  special: boolean;
  avoidAmbiguous: boolean;
}) {
  const filter = (s: string) =>
    opts.avoidAmbiguous ? [...s].filter((c) => !AMBIGUOUS.has(c)).join('') : s;
  const upper = filter('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const lower = filter('abcdefghijklmnopqrstuvwxyz');
  const num = filter('0123456789');
  const sp = SPECIAL_CHARS;
  let alphabet = '';
  if (opts.uppercase) alphabet += upper;
  if (opts.lowercase) alphabet += lower;
  if (opts.numbers) alphabet += num;
  if (opts.special) alphabet += sp;
  return { alphabet, upper, lower, num, special: sp };
}

function generatePassword(opts: {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  special: boolean;
  minNumbers: number;
  minSpecial: number;
  avoidAmbiguous: boolean;
}): string {
  const { alphabet, num, special } = buildAlphabet(opts);
  if (!alphabet) return '';

  const minN = opts.numbers ? Math.max(0, opts.minNumbers) : 0;
  const minS = opts.special ? Math.max(0, opts.minSpecial) : 0;
  const length = Math.max(opts.length, minN + minS);

  const out: string[] = [];
  for (let i = 0; i < minN; i++) out.push(num[secureRandInt(num.length)]);
  for (let i = 0; i < minS; i++) out.push(special[secureRandInt(special.length)]);
  while (out.length < length) out.push(alphabet[secureRandInt(alphabet.length)]);
  shuffleInPlace(out);
  return out.join('');
}

// 字符语法高亮：数字蓝、特殊字符红、字母默认色
function highlightPassword(pw: string) {
  return [...pw].map((c, i) => {
    let cls = '';
    if (/[0-9]/.test(c)) cls = 'text-blue-600';
    else if (SPECIAL_CHARS.includes(c)) cls = 'text-red-600';
    return (
      <span key={i} className={cls}>
        {c}
      </span>
    );
  });
}

function PasswordPanel() {
  const [length, setLength] = useState(14);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [special, setSpecial] = useState(true);
  const [minNumbers, setMinNumbers] = useState(1);
  const [minSpecial, setMinSpecial] = useState(1);
  const [avoidAmbiguous, setAvoidAmbiguous] = useState(false);
  const [pwd, setPwd] = useState('');

  const regen = () => {
    setPwd(
      generatePassword({
        length,
        uppercase,
        lowercase,
        numbers,
        special,
        minNumbers,
        minSpecial,
        avoidAmbiguous,
      }),
    );
  };

  useEffect(() => {
    regen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length, uppercase, lowercase, numbers, special, minNumbers, minSpecial, avoidAmbiguous]);

  const strength = pwdStrength(pwd, { uppercase, lowercase, numbers, special });

  return (
    <div className="space-y-5">
      <OutputBar value={pwd} onRegen={regen} highlight={highlightPassword(pwd)} />
      <StrengthBar strength={strength} />

      <Section title="选项">
        <NumberField
          label="长度"
          value={length}
          onChange={(n) => setLength(Math.min(128, Math.max(5, n)))}
          min={5}
          max={128}
          hint="5 - 128，14 位以上更安全"
        />
      </Section>

      <Section title="包含字符">
        <div className="flex flex-wrap gap-x-6 gap-y-3 pb-2">
          <Checkbox label="A-Z" checked={uppercase} onChange={setUppercase} />
          <Checkbox label="a-z" checked={lowercase} onChange={setLowercase} />
          <Checkbox label="0-9" checked={numbers} onChange={setNumbers} />
          <Checkbox label="!@#$%^&*" checked={special} onChange={setSpecial} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="最少数字"
            value={minNumbers}
            onChange={(n) => setMinNumbers(Math.max(0, n))}
            min={0}
            max={length}
            disabled={!numbers}
          />
          <NumberField
            label="最少特殊字符"
            value={minSpecial}
            onChange={(n) => setMinSpecial(Math.max(0, n))}
            min={0}
            max={length}
            disabled={!special}
          />
        </div>
        <div className="mt-3">
          <Checkbox
            label="避免歧义字符（l, I, 1, 0, O, o）"
            checked={avoidAmbiguous}
            onChange={setAvoidAmbiguous}
          />
        </div>
      </Section>
    </div>
  );
}

function pwdStrength(
  pw: string,
  opts: { uppercase: boolean; lowercase: boolean; numbers: boolean; special: boolean },
): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '—' };
  let pool = 0;
  if (opts.uppercase) pool += 26;
  if (opts.lowercase) pool += 26;
  if (opts.numbers) pool += 10;
  if (opts.special) pool += SPECIAL_CHARS.length;
  const entropy = pw.length * Math.log2(pool || 1);
  if (entropy < 36) return { score: 1, label: '弱' };
  if (entropy < 60) return { score: 2, label: '中' };
  if (entropy < 90) return { score: 3, label: '强' };
  return { score: 4, label: '非常强' };
}

function StrengthBar({ strength }: { strength: { score: 0 | 1 | 2 | 3 | 4; label: string } }) {
  const colors = ['bg-neutral-200', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];
  const txt = ['text-neutral-400', 'text-red-600', 'text-amber-600', 'text-blue-600', 'text-emerald-600'];
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={clsx('h-1.5 flex-1 rounded-full', i <= strength.score ? colors[strength.score] : 'bg-neutral-200 dark:bg-neutral-800')}
          />
        ))}
      </div>
      <span className={clsx('w-16 text-right text-xs font-medium', txt[strength.score])}>
        强度：{strength.label}
      </span>
    </div>
  );
}

// ---------- Passphrase ----------

function generatePassphrase(opts: {
  words: number;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
}): string {
  const parts: string[] = [];
  for (let i = 0; i < opts.words; i++) {
    let w: string;
    try {
      w = fakerEN.word.sample({ length: { min: 3, max: 8 } });
    } catch {
      w = 'word';
    }
    if (opts.capitalize) w = w.charAt(0).toUpperCase() + w.slice(1);
    parts.push(w);
  }
  if (opts.includeNumber && parts.length > 0) {
    const idx = secureRandInt(parts.length);
    parts[idx] = parts[idx] + secureRandInt(100);
  }
  return parts.join(opts.separator);
}

function PassphrasePanel() {
  const [words, setWords] = useState(4);
  const [separator, setSeparator] = useState('-');
  const [capitalize, setCapitalize] = useState(true);
  const [includeNumber, setIncludeNumber] = useState(true);
  const [phrase, setPhrase] = useState('');

  const regen = () => setPhrase(generatePassphrase({ words, separator, capitalize, includeNumber }));

  useEffect(() => {
    regen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, separator, capitalize, includeNumber]);

  return (
    <div className="space-y-5">
      <OutputBar value={phrase} onRegen={regen} />
      <Section title="选项">
        <NumberField
          label="词数"
          value={words}
          onChange={(n) => setWords(Math.min(20, Math.max(3, n)))}
          min={3}
          max={20}
          hint="3 - 20"
        />
        <div className="mt-3">
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">分隔符</span>
            <input
              type="text"
              value={separator}
              maxLength={3}
              onChange={(e) => setSeparator(e.target.value)}
              className="w-24 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-center font-mono text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
          <Checkbox label="首字母大写" checked={capitalize} onChange={setCapitalize} />
          <Checkbox label="包含数字" checked={includeNumber} onChange={setIncludeNumber} />
        </div>
      </Section>
    </div>
  );
}

// ---------- Username ----------

function safeWord(kind: 'adjective' | 'noun', min: number, max: number): string {
  try {
    if (kind === 'adjective') return fakerEN.word.adjective({ length: { min, max } });
    return fakerEN.word.noun({ length: { min, max } });
  } catch {
    return 'name';
  }
}

function generateUsernameRandom(opts: { capitalize: boolean; addNumber: boolean }): string {
  const adj = safeWord('adjective', 4, 8);
  const noun = safeWord('noun', 4, 8);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const a = opts.capitalize ? cap(adj) : adj;
  const n = opts.capitalize ? cap(noun) : noun;
  const num = opts.addNumber ? String(secureRandInt(10000)) : '';
  return `${a}${n}${num}`;
}

function generateEmailAlias(base: string): string {
  if (!base.includes('@')) return base;
  const [user, domain] = base.split('@');
  const tag = safeWord('noun', 4, 8).toLowerCase() + secureRandInt(1000);
  return `${user}+${tag}@${domain}`;
}

type UsernameKind = 'word' | 'email-alias';

function UsernamePanel() {
  const [kind, setKind] = useState<UsernameKind>('word');
  const [capitalize, setCapitalize] = useState(true);
  const [addNumber, setAddNumber] = useState(true);
  const [baseEmail, setBaseEmail] = useState('me@example.com');
  const [out, setOut] = useState('');

  const regen = () => {
    if (kind === 'email-alias') setOut(generateEmailAlias(baseEmail));
    else setOut(generateUsernameRandom({ capitalize, addNumber }));
  };

  useEffect(() => {
    regen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, capitalize, addNumber, baseEmail]);

  return (
    <div className="space-y-5">
      <OutputBar value={out} onRegen={regen} />
      <Section title="类型">
        <div className="flex gap-2">
          <KindButton active={kind === 'word'} onClick={() => setKind('word')}>
            随机词组
          </KindButton>
          <KindButton active={kind === 'email-alias'} onClick={() => setKind('email-alias')}>
            邮箱别名 (+tag)
          </KindButton>
        </div>
      </Section>

      {kind === 'word' && (
        <Section title="选项">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Checkbox label="首字母大写" checked={capitalize} onChange={setCapitalize} />
            <Checkbox label="附加数字" checked={addNumber} onChange={setAddNumber} />
          </div>
        </Section>
      )}

      {kind === 'email-alias' && (
        <Section title="选项">
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">基础邮箱</span>
            <input
              type="email"
              value={baseEmail}
              onChange={(e) => setBaseEmail(e.target.value)}
              placeholder="me@example.com"
              className="w-full max-w-sm rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <p className="mt-2 text-xs text-neutral-500">
            许多邮箱服务（Gmail / FastMail 等）支持 <code>user+tag@domain</code> 子地址，可用于追踪订阅来源
          </p>
        </Section>
      )}
    </div>
  );
}

function KindButton({
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
      className={clsx(
        'rounded-md border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
      )}
    >
      {children}
    </button>
  );
}

// ---------- 公共组件 ----------

function OutputBar({
  value,
  onRegen,
  highlight,
}: {
  value: string;
  onRegen: () => void;
  highlight?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex-1 break-all font-mono text-lg" style={{ minHeight: '1.75rem' }}>
        {highlight ?? value ?? <span className="text-neutral-400">—</span>}
      </div>
      <button
        onClick={onRegen}
        title="重新生成"
        className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
      <button
        onClick={copy}
        title="复制"
        className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      >
        {copied ? <span className="text-xs text-emerald-600">✓</span> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-400">{title}</h3>
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        {children}
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  hint?: string;
  disabled?: boolean;
}) {
  // 本地 text 缓冲：聚焦输入期间不强制 clamp，否则输入两位数（如 12）时
  // 第一位 "1" 会被立即 clamp 到 min，导致永远打不出 5 开头以外的数字。
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // 外部 value 变化时（且未在编辑）同步回显
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const commit = () => {
    const n = parseInt(text, 10);
    const clamped = isNaN(n) ? value : Math.min(max, Math.max(min, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <label className={clsx('block text-sm', disabled && 'opacity-50')}>
      <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{label}</span>
      <input
        type="number"
        value={text}
        min={min}
        max={max}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseInt(e.target.value, 10);
          // 仅当落在合法区间内才即时上报，避免中间态（如 "1"）触发 clamp
          if (!isNaN(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        className="w-24 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm tabular-nums dark:border-neutral-700 dark:bg-neutral-950"
      />
      {hint && <span className="ml-2 text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
      />
      <span>{label}</span>
    </label>
  );
}
