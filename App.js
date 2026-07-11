import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import NetInfo from '@react-native-community/netinfo';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import { showToast } from './src/utils/toast';

// فحص صريح عن تحديثات — بدل الاعتماد على السلوك الافتراضي الصامت
// (يحمّل التحديث بالخلفية لكن ما يطبّقه إلا بعد إعادة فتح ثانية).
// هنا: لو فيه تحديث، نحمّله ونعيد تحميل التطبيق فوراً بنفس الجلسة.
//
// ملاحظة على showToast: هو تنبيه منبثق (Alert.alert) يحتاج ضغط "حسناً" لإغلاقه،
// مو toast خفيف يختفي لحاله. لهيك ما نستخدمه للحالة العادية (لا يوجد تحديث)
// لأنها تصير بكل مرة -- بيصير تنبيه مزعج يتكرر باستمرار. نستخدمه فقط
// بالحالتين المفيدتين فعلاً: تحديث حقيقي موجود، أو فشل الفحص لسبب حقيقي
// (مو مجرد انقطاع نت -- الانقطاع وضع طبيعي متوقَّع، مو خطأ يستاهل تنبيه
// مخيف بكل فتح تطبيق أوفلاين).
async function checkAndApplyUpdate() {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return; // أوفلاين -- تجاهل صامت، مو خطأ

    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      showToast('✅ تحديث جديد تم تحميله، سيُعاد فتح التطبيق الآن', 'success');
      await Updates.reloadAsync();
    }
  } catch (e) {
    // رسالة الخطأ الخام من مكتبة expo-updates تقنية جداً ومخيفة للمستخدم
    // العادي (Call to function 'ExpoUpdates.fetchUpdateAsync' has been
    // rejected...) -- وأغلب أسبابها فعلياً اتصال ضعيف انقطع أثناء التحميل،
    // مو خطأ حقيقي بالتطبيق. نعرض رسالة مبسّطة وهادئة بدل النص التقني.
    const raw = e?.message || '';
    const isDownloadIssue = /download|network|fetch|timeout|connection/i.test(raw);
    if (isDownloadIssue) {
      showToast('⚠️ تعذّر تحميل التحديث بسبب ضعف الاتصال — التطبيق يعمل طبيعياً بآخر نسخة موجودة، وراح تتم المحاولة تلقائياً مرة ثانية لاحقاً', 'warning');
    } else {
      showToast('⚠️ تعذّر التحقق من وجود تحديث جديد', 'warning');
    }
  }
}

export default function App() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // 1) عند أول فتح (Cold start)
    checkAndApplyUpdate();

    // 2) كل مرة يرجع فيها التطبيق من الخلفية للمقدمة -- بدون حاجة لـ force-stop،
    // يكفي تصغّر التطبيق (Home / تبديل تطبيقات) وترجعله.
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current.match(/inactive|background/);
      if (wasBackground && nextState === 'active') {
        checkAndApplyUpdate();
      }
      appState.current = nextState;
    });

    return () => sub.remove();
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
