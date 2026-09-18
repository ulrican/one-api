import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getLogo, getSystemName } from '../helpers';
import './AuthLayout.css';

// 认证页（登录/注册/重置密码）全屏居中布局：品牌区 + 玻璃卡 + 返回首页
const AuthLayout = ({ title, children }) => {
  const { t } = useTranslation();
  const logo = getLogo();
  const systemName = getSystemName();

  return (
    <div className='auth-layout'>
      <div className='auth-card'>
        <div className='auth-brand'>
          <img src={logo} alt='logo' className='auth-logo' />
          <div className='auth-brand-name'>{systemName}</div>
        </div>
        <h2 className='auth-title'>{title}</h2>
        {children}
      </div>
      <div className='auth-footer'>
        <Link to='/'>
          <span className='auth-footer-icon'>←</span> {t('auth.back_home')}
        </Link>
      </div>
    </div>
  );
};

export default AuthLayout;
