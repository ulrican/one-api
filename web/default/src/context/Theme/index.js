import React, { useEffect } from 'react';
import {
  applyThemeToDocument,
  initialState,
  reducer,
  THEME_DARK,
  THEME_LIGHT,
} from './reducer';

export const ThemeContext = React.createContext({
  state: initialState,
  dispatch: () => null,
});

export const ThemeProvider = ({ children }) => {
  const [state, dispatch] = React.useReducer(reducer, initialState);

  // 主题变化时同步 <html> class 与 localStorage
  useEffect(() => {
    applyThemeToDocument(state.theme);
  }, [state.theme]);

  return (
    <ThemeContext.Provider value={[state, dispatch]}>
      {children}
    </ThemeContext.Provider>
  );
};

// 便捷 hook：const { theme, isLight, isDark, toggleTheme, setTheme } = useTheme();
export const useTheme = () => {
  const [state, dispatch] = React.useContext(ThemeContext);
  return {
    theme: state.theme,
    isDark: state.theme === THEME_DARK,
    isLight: state.theme === THEME_LIGHT,
    toggleTheme: () => dispatch({ type: 'toggle' }),
    setTheme: (theme) => dispatch({ type: 'set', payload: theme }),
  };
};
