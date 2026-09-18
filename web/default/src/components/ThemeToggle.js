import React from 'react';
import { useTheme } from '../context/Theme';

// 全站主题切换胶囊按钮（Header 等全局位置使用）。
// className 可传入以复用页面内已有样式（如 Landing 传 'tl-theme-toggle'）。
const ThemeToggle = ({ className = 'app-theme-toggle' }) => {
  const { isLight, toggleTheme } = useTheme();

  return (
    <button
      type='button'
      className={className}
      onClick={toggleTheme}
      aria-pressed={isLight}
      title={isLight ? '切换为暗色科技风格' : '切换为亮色简约风格'}
    >
      <span className='att-icon' aria-hidden='true'>
        {isLight ? '🌙' : '☀️'}
      </span>
      <span className='att-text'>{isLight ? '科技风' : '简约风'}</span>
    </button>
  );
};

export default ThemeToggle;
