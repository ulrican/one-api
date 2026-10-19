// Task3-1/3-2：导航菜单共享配置（SideNav 左侧菜单栏 与 Header 移动端抽屉共用）
// 分组顺序即菜单渲染顺序；item.admin 仅管理员可见
// 对话功能已移除（Playground 下线），对话类体验统一由「模型体验」/experience 承接

// Task4-9：模型体验独立入口（侧栏置顶，Header 移动端抽屉同步）
export const getExperienceItem = () => ({
  name: 'header.experience',
  to: '/experience',
  icon: 'flask',
});

export const getNavGroups = () => [
  {
    key: 'general',
    titleKey: 'sidenav.group.general',
    items: [
      { name: 'header.dashboard', to: '/dashboard', icon: 'chart bar' },
      { name: 'header.application', to: '/application', icon: 'cubes' },
      { name: 'header.log', to: '/log', icon: 'book' },
    ],
  },
  {
    key: 'resource',
    titleKey: 'sidenav.group.resource',
    items: [
      { name: 'header.topup', to: '/topup', icon: 'cart' },
      {
        name: 'header.marketplace',
        to: '/marketplace',
        icon: 'shop',
        statusFlag: 'marketplace_enabled',
      },
      // Task4-11：模型价格页补入口（页面 /pricing 已存在，此前无导航入口）
      { name: 'header.pricing', to: '/pricing', icon: 'tags' },
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
    // Task4-11：管理组命名统一「××管理」（渠道/倍率/用户/运营/支付/系统/站点）
    // 顺序：实体管理 → 运营配置 → 支付配置 → 系统配置 → 站点配置
    // Task4-10 调整：兑换码管理合并进 /payment 的「兑换」Tab，删除独立兑换菜单
    items: [
      { name: 'header.channel', to: '/channel', icon: 'sitemap', admin: true },
      { name: 'header.ratio', to: '/ratio', icon: 'balance scale', admin: true },
      { name: 'header.user', to: '/user', icon: 'user', admin: true },
      {
        name: 'header.operation',
        to: '/operation',
        icon: 'settings',
        admin: true,
      },
      {
        name: 'header.payment',
        to: '/payment',
        icon: 'credit card',
        admin: true,
      },
      { name: 'header.system', to: '/system', icon: 'server', admin: true },
      { name: 'header.site', to: '/site', icon: 'globe', admin: true },
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
// Task4-11：新增模型价格入口
export const topNavLinks = [
  { name: 'header.home', to: '/' },
  { name: 'header.marketplace', to: '/marketplace' },
  { name: 'header.pricing', to: '/pricing' },
  { name: 'header.rankings', to: '/rankings' },
  { name: 'header.about', to: '/about' },
];
