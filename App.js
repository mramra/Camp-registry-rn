import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import NetInfo from '@react-native-community/netinfo';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { showToast } from './src/utils/toast';
import { ensureNotificationPermission } from './src/lib/notifications';

// فحص صريح عن تحديثات — بدل الاعتماد على السلوك الافتراضي الصامت
// (يحمّل التحديث بالخلفية لكن ما يطبّقه إلا بعد إعادة فتح ثانية).
//
// ⚠️ مهم جداً: forceReload=true (إعادة تحميل فورية) تُستخدم فقط عند
// فتح التطبيق من الصفر (Cold start) -- وقتها مضمون عدم وجود أي تفاعل
// نشط للمستخدم بعد (زي كتابة كلمة مرور بشاشة الدخول). عند الرجوع من
// الخلفية (foreground resume)، forceReload=false: نحمّل التحديث
// بالخلفية بهدوء بس ما نعيد التحميل فوراً -- لأن المستخدم ممكن يكون
// بمنتصف تفاعل نشط (بيكتب بيانات دخول مثلاً)، وإعادة التحميل المفاجئة
// كانت تقطع كل شي وتطلعله "صفحة فاضية جديدة" بدون أي تفسير أو تحذير
// (بالضبط الأعراض يلي وصفها محمود). التحديث المحمَّل بهدوء يُطبَّق
// تلقائياً بالمرة الجاية يفتح فيها التطبيق من الصفر.
async function checkAndApplyUpdate(forceReload = true) {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return; // أوفلاين -- تجاهل صامت، مو خطأ

    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      if (forceReload) {
        showToast('✅ تحديث جديد تم تحميله، سيُعاد فتح التطبيق الآن', 'success');
        await Updates.reloadAsync();
      }
      // forceReload=false: التحديث جاهز ومحمَّل، بس بينتظر فتحة جديدة
      // للتطبيق ليُطبَّق -- بدون مقاطعة المستخدم الآن.
    }
  } catch (e) {
    // رسالة الخطأ الخام من مكتبة expo-updates تقنية جداً ومخيفة للمستخدم
    // العادي (Call to function 'ExpoUpdates.fetchUpdateAsync' has been
    // rejected...) -- وأغلب أسبابها فعلياً اتصال ضعيف انقطع أثناء التحميل،
    // مو خطأ حقيقي بالتطبيق. نعرض رسالة مبسّطة وهادئة بدل النص التقني.
    // (بدون إزعاج المستخدم بتنبيه لو forceReload=false أصلاً -- فحص هادئ
    // بالخلفية ما يستاهل مقاطعته برسالة خطأ.)
    if (!forceReload) return;
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
    // 1) عند أول فتح (Cold start) -- آمن نعيد التحميل فوراً، ما في
    // أي تفاعل نشط للمستخدم بعد
    checkAndApplyUpdate(true);
    ensureNotificationPermission();

    // 2) كل مرة يرجع فيها التطبيق من الخلفية للمقدمة -- نحمّل بهدوء
    // بس بدون مقاطعة فورية (المستخدم قد يكون بمنتصف تفاعل نشط)
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current.match(/inactive|background/);
      if (wasBackground && nextState === 'active') {
        checkAndApplyUpdate(false);
      }
      appState.current = nextState;
    });

    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor="#0d1117" />
      <RootNavigator />
    </AuthProvider>
  );
}
