// 全站主题（双主题：dark=科技暗色，light=简约亮色）
export const THEME_DARK = 'dark';
export const THEME_LIGHT = 'light';
export const THEME_STORAGE_KEY = 'app_theme';
// Task01 落地页旧偏好 key，初始化时迁移合并
export const LEGACY_THEME_STORAGE_KEY = 'landing_theme';

// 计算初始主题：localStorage.app_theme → 旧 landing_theme → 系统偏好 → dark
export function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === THEME_DARK || saved === THEME_LIGHT) {
      return saved;
    }
    // 迁移 Task01 落地页偏好（tech=暗色 / simple=亮色）
    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === 'tech') return THEME_DARK;
    if (legacy === 'simple') return THEME_LIGHT;
  } catch (e) {
    // localStorage 不可用时降级为系统偏好
  }
  try {
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: light)').matches
    ) {
      return THEME_LIGHT;
    }
  } catch (e) {
    // matchMedia 不可用
  }
  return THEME_DARK;
}

// 将主题同步到 <html> class（与 public/index.html 内联脚本、tokens.css 约定一致）
export function applyThemeToDocument(theme) {
  const el = document.documentElement;
  el.classList.remove('theme-dark', 'theme-light');
  el.classList.add(theme === THEME_LIGHT ? 'theme-light' : 'theme-dark');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    // 持久化失败时静默降级为会话内切换
  }
}

export const initialState = {
  theme: getInitialTheme(),
};

export const reducer = (state, action) => {
  switch (action.type) {
    case 'set':
      return { ...state, theme: action.payload };
    case 'toggle':
      return {
        ...state,
        theme: state.theme === THEME_LIGHT ? THEME_DARK : THEME_LIGHT,
      };
    default:
      return state;
  }
};
