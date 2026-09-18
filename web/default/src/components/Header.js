import React, { useContext, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UserContext } from '../context/User';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Container,
  Dropdown,
  Icon,
  Menu,
  Segment,
} from 'semantic-ui-react';
import {
  API,
  getLogo,
  getSystemName,
  isAdmin,
  isMobile,
  showSuccess,
} from '../helpers';
import ThemeToggle from './ThemeToggle';
import { getChatItem, getVisibleNavGroups, topNavLinks } from './navConfig';
import '../index.css';

// Task3-1：顶部导航菜单项与首页顶部导航栏一致（topNavLinks），
// 功能菜单全部移入左侧菜单栏（SideNav）；移动端抽屉复用 navConfig。

const Header = () => {
  const { t, i18n } = useTranslation();
  const [userState, userDispatch] = useContext(UserContext);
  let navigate = useNavigate();
  const { pathname } = useLocation();

  const [showSidebar, setShowSidebar] = useState(false);
  const systemName = getSystemName();
  const logo = getLogo();
  const loggedIn = !!userState.user;

  async function logout() {
    setShowSidebar(false);
    await API.get('/api/user/logout');
    showSuccess('注销成功!');
    userDispatch({ type: 'logout' });
    localStorage.removeItem('user');
    navigate('/login');
  }

  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  const isActive = (to) => pathname === to || pathname.startsWith(to + '/');

  // 移动端抽屉：聊天独立项置顶 + 按 navConfig 分组渲染功能菜单
  const renderSideGroups = () => {
    const chatItem = getChatItem();
    return (
      <>
        {chatItem && (
          <Menu.Item
            as={Link}
            to={chatItem.to}
            className={isActive(chatItem.to) ? 'app-nav-active' : ''}
            onClick={() => setShowSidebar(false)}
          >
            <Icon name={chatItem.icon} />
            {t(chatItem.name)}
          </Menu.Item>
        )}
        {getVisibleNavGroups()
          .filter((group) => !group.admin || isAdmin())
          .map((group) => (
            <React.Fragment key={group.key}>
              <Menu.Item as='span' className='app-mobile-group-title'>
                {t(group.titleKey)}
              </Menu.Item>
              {group.items.map((item) => (
                <Menu.Item
                  key={item.name}
                  as={Link}
                  to={item.to}
                  className={isActive(item.to) ? 'app-nav-active' : ''}
                  onClick={() => setShowSidebar(false)}
                >
                  <Icon name={item.icon} />
                  {t(item.name)}
                </Menu.Item>
              ))}
            </React.Fragment>
          ))}
      </>
    );
  };

  // Add language switcher dropdown
  const languageOptions = [
    { key: 'zh', text: '中文', value: 'zh' },
    { key: 'en', text: 'English', value: 'en' },
  ];

  const changeLanguage = (language) => {
    i18n.changeLanguage(language);
  };

  const brandTo = loggedIn ? '/dashboard' : '/';

  if (isMobile()) {
    return (
      <>
        <Menu borderless size='large' className='app-header'>
          <Container
            style={{
              width: '100%',
              maxWidth: '100%',
              padding: '0 14px',
            }}
          >
            <Menu.Item as={Link} to={brandTo}>
              <img
                src={logo}
                alt='logo'
                className='app-brand-logo'
                style={{ marginRight: '0.6em' }}
              />
              <div className='app-brand-name'>{systemName}</div>
            </Menu.Item>
            <Menu.Menu position='right'>
              <Menu.Item className='app-burger' onClick={toggleSidebar}>
                <Icon name={showSidebar ? 'close' : 'sidebar'} />
              </Menu.Item>
            </Menu.Menu>
          </Container>
        </Menu>
        {showSidebar ? (
          <Segment className='app-mobile-menu'>
            <Menu secondary vertical style={{ width: '100%', margin: 0 }}>
              {topNavLinks.map((link) => (
                <Menu.Item
                  key={link.name}
                  as={Link}
                  to={link.to}
                  className={isActive(link.to) ? 'app-nav-active' : ''}
                  onClick={() => setShowSidebar(false)}
                >
                  {t(link.name)}
                </Menu.Item>
              ))}
              <Menu.Item as='span' className='app-nav-divider' />
              {renderSideGroups()}
              <Menu.Item as='span' className='app-nav-divider' />
              <Menu.Item>
                <ThemeToggle />
              </Menu.Item>
              <Menu.Item>
                <Dropdown
                  selection
                  trigger={
                    <Icon name='language' style={{ margin: 0, fontSize: '18px' }} />
                  }
                  options={languageOptions}
                  value={i18n.language}
                  onChange={(_, { value }) => changeLanguage(value)}
                />
              </Menu.Item>
              <Menu.Item>
                {loggedIn ? (
                  <Button onClick={logout}>{t('header.logout')}</Button>
                ) : (
                  <>
                    <Button
                      primary
                      onClick={() => {
                        setShowSidebar(false);
                        navigate('/login');
                      }}
                    >
                      {t('header.login')}
                    </Button>
                    <Button
                      onClick={() => {
                        setShowSidebar(false);
                        navigate('/register');
                      }}
                    >
                      {t('header.register')}
                    </Button>
                  </>
                )}
              </Menu.Item>
            </Menu>
          </Segment>
        ) : (
          <></>
        )}
      </>
    );
  }

  return (
    <Menu borderless className='app-header'>
      <Container
        style={{
          width: '100%',
          maxWidth: '100%',
          padding: '0 24px',
        }}
      >
        <Menu.Item as={Link} to={brandTo} className='hide-on-mobile'>
          <img
            src={logo}
            alt='logo'
            className='app-brand-logo'
            style={{ marginRight: '0.75em' }}
          />
          <div className='app-brand-name'>{systemName}</div>
        </Menu.Item>
        {topNavLinks.map((link) => (
          <Menu.Item
            key={link.name}
            as={Link}
            to={link.to}
            className={isActive(link.to) ? 'app-nav-active' : ''}
          >
            {t(link.name)}
          </Menu.Item>
        ))}
        <Menu.Menu position='right'>
          <Menu.Item as='span' className='app-theme-toggle-item'>
            <ThemeToggle />
          </Menu.Item>
          <Dropdown
            item
            trigger={<Icon name='language' style={{ margin: 0, fontSize: '18px' }} />}
            options={languageOptions}
            value={i18n.language}
            onChange={(_, { value }) => changeLanguage(value)}
          />
          {loggedIn ? (
            <Dropdown
              text={userState.user.username}
              pointing
              className='link item'
              icon='user circle'
            >
              <Dropdown.Menu>
                <Dropdown.Item onClick={logout}>
                  {t('header.logout')}
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          ) : (
            <Menu.Item
              name={t('header.login')}
              as={Link}
              to='/login'
              className='btn btn-link'
            />
          )}
        </Menu.Menu>
      </Container>
    </Menu>
  );
};

export default Header;
