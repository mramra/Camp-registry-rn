import React, { createContext } from 'react';
import colors from '../theme/colors';

/**
 * التصميم الأصلي (camp-registry-react) داكن فقط — لا يوجد وضع فاتح.
 * نحافظ على نفس واجهة useTheme() المستخدمة بالشاشات لتقليل التغييرات.
 */
export const ThemeContext = createContext({ colors });

export const ThemeProvider = ({ children }) => (
  <ThemeContext.Provider value={{ colors, isDark: true }}>
    {children}
  </ThemeContext.Provider>
);

export const useTheme = () => React.useContext(ThemeContext);

export default ThemeContext;
