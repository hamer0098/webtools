'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { ToolSlug } from './tools-registry';

const Loading = () => (
  <div className="p-8 text-sm text-neutral-500">加载中…</div>
);

export const TOOLS_COMPONENTS: Record<ToolSlug, ComponentType<{ noteSlug?: string }>> = {
  totp: dynamic(() => import('@/tools/totp'), { loading: Loading }),
  notepad: dynamic(() => import('@/tools/notepad'), { loading: Loading }),
  send: dynamic(() => import('@/tools/send'), { loading: Loading }),
  tempmail: dynamic(() => import('@/tools/tempmail'), { loading: Loading }),
  faker: dynamic(() => import('@/tools/faker'), { loading: Loading }),
  password: dynamic(() => import('@/tools/password'), { loading: Loading }),
  qrcode: dynamic(() => import('@/tools/qrcode'), { loading: Loading }),
  encode: dynamic(() => import('@/tools/encode'), { loading: Loading }),
  chinese: dynamic(() => import('@/tools/chinese'), { loading: Loading }),
};
