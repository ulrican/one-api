import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { Container } from 'semantic-ui-react';
import App from './App';
import Header from './components/Header';
import SideNav from './components/SideNav';
import Footer from './components/Footer';
import 'semantic-ui-css/semantic.min.css';
// 第三方组件库样式必须先于本项目主题 CSS 加载：同特异性下后者生效，
// 否则 react-toastify 的白底浅色 toast 在暗色下穿帮（实测白 toast 白字）
import 'react-toastify/dist/ReactToastify.css';
import './index.css';
import './theme/tokens.css';
import './theme/semantic-ui.css';
import './theme/app-frame.css';
import { UserProvider } from './context/User';
import { ToastContainer } from 'react-toastify';
import { StatusProvider } from './context/Status';
import { ThemeProvider } from './context/Theme';
import './i18n';

// 全屏独立页面路由（自带外壳或全屏布局，不套用全局 Header/Container/Footer）
// / 为落地页（自带导航）；认证/OAuth 回调页为全屏居中布局
const STANDALONE_PATHS = [
  '/',
  '/login',
  '/register',
  '/reset',
  '/user/reset',
  '/oauth/github',
  '/oauth/lark',
];

const AppLayout = () => {
  const location = useLocation();
  const isStandalone = STANDALONE_PATHS.includes(location.pathname);

  if (isStandalone) {
    return (
      <>
        <App />
        <ToastContainer />
      </>
    );
  }

  return (
    <div className='app-frame'>
      <Header />
      <div className='app-shell'>
        <SideNav />
        {/* Task3-4：内容列为弹性列，内部内容区独立滚动，Footer 置于该列底部，
            只占内容区宽度（不再横跨侧栏），且不随内容滚动 */}
        <div className='app-main-col'>
          <Container className={'main-content'}>
            <App />
          </Container>
          <Footer />
        </div>
      </div>
      <ToastContainer />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <StatusProvider>
      <ThemeProvider>
        <UserProvider>
          <BrowserRouter>
            <AppLayout />
          </BrowserRouter>
        </UserProvider>
      </ThemeProvider>
    </StatusProvider>
  </React.StrictMode>
);
