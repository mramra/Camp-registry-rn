import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import { showToast } from './src/utils/toast';

export default function App() {
  // فحص صريح عن تحديثات عند كل إطلاق — بدل الاعتماد على السلوك الافتراضي
  // الصامت (يحمّل التحديث بالخلفية لكن ما يطبّقه إلا بعد إعادة فتح ثانية).
  // هنا: لو فيه تحديث، نحمّله ونعيد تحميل التطبيق فوراً بنفس الجلسة.
  //
  // ملاحظة على showToast: هو تنبيه منبثق (Alert.alert) يحتاج ضغط "حسناً" لإغلاقه،
  // مو toast خفيف يختفي لحاله. لهيك ما نستخدمه للحالة العادية (لا يوجد تحديث)
  // لأنها تصير بكل فتح تطبيق -- بيصير تنبيه مزعج يتكرر كل مرة. نستخدمه فقط
  // بالحالتين المفيدتين فعلاً: تحديث حقيقي موجود، أو فشل الفحص (عشان تعرف السبب
  // بدل ما يفشل بصمت وتبقى الحيرة "ليش ما تحدّث؟" -- خصوصاً إنه ما فيه وصول
  // لـ console على الموبايل).
  useEffect(() => {
    (async () => {
      if (__DEV__ || !Updates.isEnabled) return;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          showToast('✅ تحديث جديد تم تحميله، سيُعاد فتح التطبيق الآن', 'success');
          await Updates.reloadAsync();
        }
      } catch (e) {
        showToast('⚠️ فشل التحقق من التحديث: ' + e.message, 'error');
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
