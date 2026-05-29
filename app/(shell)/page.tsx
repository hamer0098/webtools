// 首页内容（欢迎页）由常驻 ToolHost 在 pathname 为 '/' 时渲染。
// 这里返回 null，让所有 (shell) 路由的内容都统一从 ToolHost 出，
// 这样侧边栏用 history.pushState 切换时不会残留旧的 children。
export default function HomePage() {
  return null;
}
