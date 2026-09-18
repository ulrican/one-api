// Task3-1/3-2：导航菜单共享配置（SideNav 左侧菜单栏 与 Header 移动端抽屉共用）
// 分组顺序即菜单渲染顺序；item.admin 仅管理员可见
// Task3-2：聊天为独立模块置顶（getChatItem）；总览/令牌/日志归入「常规」组

// 独立聊天入口（Task3-4：常驻侧栏顶部，不再因功能开关而缺失）
// - 开启 Playground 时指向内置对话页 /playground
// - 未开启 Playground 但配置了外部对话链接 chat_link 时走 iframe 页 /chat
// - 两者都无（默认）时仍指向内置 /playground（登录后控制台可用），保证聊天入口始终存在
export const getChatItem = () => {
  if (
    localStorage.getItem('playground_enabled') !== 'true' &&
    localStorage.getItem('chat_link')
  ) {
    return { name: 'header.chat', to: '/chat', icon: 'comments' };
  }
  return { name: 'header.chat', to: '/playground', icon: 'comments' };
};

export const getNavGroups = () => [
  {
    key: 'general',
    titleKey: 'sidenav.group.general',
    items: [
      { name: 'header.dashboard', to: '/dashboard', icon: 'chart bar' },
      { name: 'header.token', to: '/token', icon: 'key' },
      { name: 'header.log', to: '/log', icon: 'book' },
    ],
  },
  {
    key: 'resource',
    titleKey: 'sidenav.group.resource',
    items: [
      { name: 'header.topup', to: '/topup', icon: 'cart' },
      { name: 'header.pricing', to: '/pricing', icon: 'dollar' },
      {
        name: 'header.marketplace',
        to: '/marketplace',
        icon: 'shop',
        statusFlag: 'marketplace_enabled',
      },
      { name: 'header.rankings', to: '/rankings', icon: 'trophy' },
    ],
  },
  {
    key: 'account',
    titleKey: 'sidenav.group.account',
    items: [
      { name: 'header.setting', to: '/setting', icon: 'setting' },
      { name: 'header.about', to: '/about', icon: 'info circle' },
    ],
  },
  {
    key: 'admin',
    titleKey: 'sidenav.group.admin',
    admin: true,
    items: [
      { name: 'header.channel', to: '/channel', icon: 'sitemap', admin: true },
      {
        name: 'header.redemption',
        to: '/redemption',
        icon: 'dollar sign',
        admin: true,
      },
      { name: 'header.user', to: '/user', icon: 'user', admin: true },
    ],
  },
];

// 带 statusFlag 的菜单项仅当 /api/status 下发对应开关为 true（localStorage 标记）时可见
export const navItemVisible = (item) =>
  !item.statusFlag || localStorage.getItem(item.statusFlag) === 'true';

// 返回过滤掉不可见项后的分组（整组无可见项一并剔除）
export const getVisibleNavGroups = () =>
  getNavGroups()
    .map((group) => ({
      ...group,
      items: group.items.filter(navItemVisible),
    }))
    .filter((group) => group.items.length > 0);

// 顶部导航链接组（菜单项与首页顶部导航栏一致，锚点对应控制台真实路由）
export const topNavLinks = [
  { name: 'header.home', to: '/' },
  { name: 'header.pricing', to: '/pricing' },
  { name: 'header.rankings', to: '/rankings' },
  { name: 'header.about', to: '/about' },
];
