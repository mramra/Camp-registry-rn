import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  // فحص صريح عن تحديثات عند كل إطلاق — بدل الاعتماد على السلوك الافتراضي
  // الصامت (يحمّل التحديث بالخلفية لكن ما يطبّقه إلا بعد إعادة فتح ثانية).
  // هنا: لو فيه تحديث، نحمّله ونعيد تحميل التطبيق فوراً بنفس الجلسة.
  useEffect(() => {
    (async () => {
      try {
        if (__DEV__ || !Updates.isEnabled) return;
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        // فشل فحص التحديث لا يجب أن يمنع فتح التطبيق أبداً
      }
    })();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar style="light" backgroundColor="#0d1117" />
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
