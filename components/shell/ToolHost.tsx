'use client';

import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import { TOOLS_COMPONENTS } from '@/lib/tools-components';
import { isToolSlug, type ToolSlug } from '@/lib/tools-registry';

// 这些工具的「裸 slug 入口」(无二级 slug,如 /notepad、/tempmail)只是一次性
// 重定向 stub：组件 mount 时生成/恢复一个二级 slug 并 router.replace 跳走。
// 它们不能 keep-alive —— 复用旧实例时跳转 useEffect 依赖未变不会重跑,会永远卡在
// 「加载中 / 初始化中…」。所以裸入口只在激活时渲染、跳走即卸载,每次进入都重新 mount。
// 新增需要二级 slug 的工具(照 notepad/tempmail 模式)时,记得把 slug 加进这里。
const REDIRECT_ENTRY = new Set<ToolSlug>(['notepad', 'tempmail']);

/**
 * 常驻工具宿主：挂在持久化的 shell 布局里，不随路由切换卸载。
 *
 * 工具组件「首次访问即挂载，之后只切显隐而非卸载」，这样切回已访问过的
 * 工具时实例还活着 —— 状态保留、effect 不重跑、不闪「加载中」。
 *
 * 路由页（[tool]/page.tsx 等）只做校验并 return null，内容统一在这里渲染。
 */
export default function ToolHost({ enabledSlugs }: { enabledSlugs: string[] }) {
  const pathname = usePathname() || '/';
  const parts = pathname.split('/').filter(Boolean);
  const slug = parts[0] ?? '';
  const sub = parts[1]; // 二级 slug（notepad / tempmail）

  const onHome = parts.length === 0; // pathname === '/'
  const isTool = isToolSlug(slug);
  const enabled = isTool && enabledSlugs.includes(slug);

  // 裸重定向入口(无二级 slug 的 notepad/tempmail)不保活,每次重新 mount 执行跳转
  const isRedirectEntry =
    enabled && !sub && REDIRECT_ENTRY.has(slug as ToolSlug);

  // 不同二级 slug 视为不同实例（各自保活），切换主工具则复用同一实例
  const activeKey =
    enabled && !isRedirectEntry ? slug + (sub ? '/' + sub : '') : '';

  // 已挂载过的工具实例表。在渲染期惰性累加是幂等的：同一个 activeKey 只加一次
  const mounted = useRef<Map<string, { slug: ToolSlug; sub?: string }>>(
    new Map(),
  );
  if (activeKey && !mounted.current.has(activeKey)) {
    mounted.current.set(activeKey, { slug: slug as ToolSlug, sub });
  }

  // 裸入口组件：仅当前激活时渲染,跳走即卸载（不进保活表）
  const EntryTool = isRedirectEntry ? TOOLS_COMPONENTS[slug as ToolSlug] : null;

  return (
    <>
      <div hidden={!onHome}>
        <HomeWelcome />
      </div>
      {Array.from(mounted.current.entries()).map(([key, inst]) => {
        const Tool = TOOLS_COMPONENTS[inst.slug];
        const active = key === activeKey;
        return (
          <div key={key} hidden={!active} aria-hidden={!active}>
            <Tool noteSlug={inst.sub} />
          </div>
        );
      })}
      {EntryTool && <EntryTool />}
      {isTool && !enabled && (
        <div className="p-8 text-sm text-neutral-500">该工具未启用</div>
      )}
    </>
  );
}

function HomeWelcome() {
  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold">欢迎使用 Webtools</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        从左侧选择一个工具开始使用。
      </p>
      <ul className="mt-6 list-disc pl-6 text-sm text-neutral-600 dark:text-neutral-400">
        <li>TOTP / 2FA：粘贴 secret 实时显示 6 位验证码</li>
        <li>在线笔记：URL 即笔记，自动保存，可选密码保护</li>
        <li>假身份生成：一键生成姓名/地址/电话/邮箱等</li>
      </ul>
    </div>
  );
}
