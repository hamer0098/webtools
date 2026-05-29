'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Copy, Check, QrCode as QrIcon } from 'lucide-react';
import QRCode from 'qrcode';

type ErrorLevel = 'L' | 'M' | 'Q' | 'H';

const ERROR_LEVELS: Array<{ value: ErrorLevel; label: string; desc: string }> = [
  { value: 'L', label: 'L (低)', desc: '可恢复 7% 损坏' },
  { value: 'M', label: 'M (中)', desc: '可恢复 15% 损坏' },
  { value: 'Q', label: 'Q (高)', desc: '可恢复 25% 损坏' },
  { value: 'H', label: 'H (最高)', desc: '可恢复 30% 损坏，含 Logo 用' },
];

export default function QrcodeTool() {
  const [text, setText] = useState('https://');
  const [size, setSize] = useState(320);
  const [margin, setMargin] = useState(2);
  const [level, setLevel] = useState<ErrorLevel>('M');
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!text.trim()) {
      setDataUrl('');
      setError(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(text, {
      width: size,
      margin,
      errorCorrectionLevel: level,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (cancelled) return;
        setDataUrl(url);
        setError(null);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setDataUrl('');
        setError(e.message || '生成失败');
      });
    return () => {
      cancelled = true;
    };
  }, [text, size, margin, level]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'qrcode.png';
    a.click();
  };

  const copyImage = async () => {
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Safari 等不支持 ClipboardItem image 时退化复制 dataUrl
      await navigator.clipboard.writeText(dataUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <div className="min-h-[calc(100vh-2.75rem)] bg-neutral-50 p-4 dark:bg-neutral-950 md:min-h-screen md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-2">
          <QrIcon className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold">二维码生成</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* 输入区 */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                文本 / 网址
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="输入任意文本或网址，自动生成"
                className="w-full resize-none rounded border border-neutral-300 bg-white p-3 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
              <div className="mt-1 text-xs text-neutral-500">
                {text.length} 字符 · 内容越长二维码越密
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  尺寸 ({size}px)
                </label>
                <input
                  type="range"
                  min={128}
                  max={1024}
                  step={32}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  边距 ({margin})
                </label>
                <input
                  type="range"
                  min={0}
                  max={8}
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                容错等级
              </label>
              <div className="grid grid-cols-4 gap-1">
                {ERROR_LEVELS.map((lvl) => (
                  <button
                    key={lvl.value}
                    onClick={() => setLevel(lvl.value)}
                    title={lvl.desc}
                    className={
                      level === lvl.value
                        ? 'rounded border border-blue-600 bg-blue-600 px-2 py-1.5 text-xs text-white'
                        : 'rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800'
                    }
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {ERROR_LEVELS.find((l) => l.value === level)?.desc}
              </div>
            </div>
          </div>

          {/* 预览区 */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex aspect-square w-full max-w-md items-center justify-center rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800">
              {error ? (
                <div className="text-center text-sm text-red-600">{error}</div>
              ) : dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dataUrl}
                  alt="qrcode preview"
                  className="h-auto max-h-full w-auto max-w-full"
                />
              ) : (
                <div className="text-sm text-neutral-400">输入内容后自动生成</div>
              )}
            </div>
            <div className="flex w-full max-w-md gap-2">
              <button
                onClick={download}
                disabled={!dataUrl}
                className="flex flex-1 items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
              >
                <Download className="h-4 w-4" /> 下载 PNG
              </button>
              <button
                onClick={copyImage}
                disabled={!dataUrl}
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-green-600" /> 已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> 复制图片
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
