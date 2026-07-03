import React from 'react';
import { PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { useTheme } from './ThemeContext';

// يبني theme خاص بـ Paper من ألوان التطبيق نفسها (بدل الثيم الافتراضي المنفصل)
const PaperThemeBridge = ({ children }) => {
  const { colors, isDark } = useTheme();

  const base = isDark ? MD3DarkTheme : MD3LightTheme;

  const paperTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      onPrimary: '#ffffff',
      secondary: colors.secondary,
      onSecondary: '#ffffff',
      background: colors.bg,
      onBackground: colors.text,
      surface: colors.surface,
      onSurface: colors.text,
      surfaceVariant: colors.surface2,
      onSurfaceVariant: colors.textSecondary,
      outline: colors.border,
      error: colors.error,
      onError: '#ffffff',
      elevation: {
        ...base.colors.elevation,
        level0: 'transparent',
        level1: colors.surface,
        level2: colors.surface,
        level3: colors.surface2,
        level4: colors.surface2,
        level5: colors.surface2,
      },
    },
  };

  return <PaperProvider theme={paperTheme}>{children}</PaperProvider>;
};

export default PaperThemeBridge;
