import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon, Menu } from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';

import { isAdmin } from '../helpers';
import { getChatItem, getVisibleNavGroups } from './navConfig';

// Task3-2：桌面端左侧菜单栏
// - 全高固定（sticky，从 Header 下沿至视口底），表面色 + 右边框分隔
// - 顶部独立聊天入口（品牌渐变），其下分组菜单：常规/资源/账户/管理（仅管理员）
// - 可展开/收缩：展开 212px 显图标+文字，收缩 64px 仅图标，状态持久化 localStorage
const COLLAPSE_KEY = 'app_sidenav_collapsed';

const SideNav = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true'
  );

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, String(next));
  };

  const isActive = (to) => pathname === to || pathname.startsWith(to + '/');

  const chatItem = getChatItem();
  const groups = getVisibleNavGroups().filter(
    (group) => !group.admin || isAdmin()
  );

  return (
    <aside
      className={`app-sidenav${collapsed ? ' app-sidenav-collapsed' : ''}`}
    >
      <div className='app-sidenav-scroll'>
        {chatItem && (
          <Link
            to={chatItem.to}
            className={`app-sidenav-chat${
              isActive(chatItem.to) ? ' app-sidenav-chat-active' : ''
            }`}
            title={t(chatItem.name)}
          >
            <Icon name={chatItem.icon} />
            <span className='app-sidenav-label'>{t(chatItem.name)}</span>
          </Link>
        )}
        <Menu vertical borderless fluid className='app-sidenav-menu'>
          {groups.map((group) => (
            <React.Fragment key={group.key}>
              <Menu.Item as='span' className='app-sidenav-group-title'>
                {t(group.titleKey)}
              </Menu.Item>
              {group.items.map((item) => (
                <Menu.Item
                  key={item.name}
                  as={Link}
                  to={item.to}
                  title={t(item.name)}
                  className={isActive(item.to) ? 'app-sidenav-active' : ''}
                >
                  <Icon name={item.icon} />
                  <span className='app-sidenav-label'>{t(item.name)}</span>
                </Menu.Item>
              ))}
            </React.Fragment>
          ))}
        </Menu>
      </div>
      <div className='app-sidenav-footer'>
        <button
          type='button'
          className='app-sidenav-toggle'
          onClick={toggleCollapsed}
          title={collapsed ? t('sidenav.expand') : t('sidenav.collapse')}
        >
          <Icon name={collapsed ? 'angle double right' : 'angle double left'} />
          <span className='app-sidenav-label'>
            {collapsed ? t('sidenav.expand') : t('sidenav.collapse')}
          </span>
        </button>
      </div>
    </aside>
  );
};

export default SideNav;
