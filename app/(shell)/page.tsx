export default function HomePage() {
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
