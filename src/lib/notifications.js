import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// طريقة عرض الإشعار وقت وصوله والتطبيق مفتوح بالمقدمة (foreground) --
// بدونها إشعارات المقدمة ما تظهر إطلاقاً على أندرويد بمكتبة expo-notifications.
//
// ⚠️ محاط بـ try/catch إجبارياً: هذا استدعاء أصلي (native) يشتغل فوراً
// عند تحميل الملف (استيراد App.js له) -- لو المكتبة الأصلية غير موجودة
// فعلياً بالـ APK المثبَّت (نسخة قديمة قبل هذا التحديث) أو على الويب
// (غير مدعوم إطلاقاً)، بدون هذه الحماية كان الاستدعاء يكسر تحميل
// التطبيق بالكامل فوراً = شاشة بيضاء خالية عند كل فتح. هذا بالضبط ما
// حصل بعد أول رفع لهذا الملف قبل إضافة الحماية.
if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // فشل تسجيل معالج الإشعارات غير حرج -- التطبيق يستمر عادياً بدون
    // إشعارات فقط (يصير هذا تحديداً على أي APK قديم قبل تثبيت النسخة
    // الجديدة التي تحوي مكتبة expo-notifications الأصلية فعلياً)
  }
}

let permissionAsked = false;

/** يطلب إذن الإشعارات مرة واحدة فقط بكل جلسة (لا داعي لتكراره بكل شاشة) */
export async function ensureNotificationPermission() {
  if (Platform.OS === 'web' || permissionAsked) return;
  permissionAsked = true;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') await Notifications.requestPermissionsAsync();
  } catch {
    // فشل طلب الإذن غير حرج -- التطبيق يستمر بدون إشعارات فقط
  }
}

/**
 * إشعار فوري محلي (يظهر خلال ثوانٍ). يعمل طالما JS للتطبيق لسه شغّال
 * (بالمقدمة أو بالخلفية القريبة) -- لا يعمل لو أُغلق التطبيق بالكامل
 * (force stop) أو انتهت مهلة أندرويد للخلفية؛ هذا يحتاج Push Notification
 * حقيقي من سيرفر خارجي، وهو خارج نطاق الإشعارات المحلية.
 */
export async function notifyNow(title, body, data = {}) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: null,
    });
  } catch {
    // فشل الإشعار غير حرج -- لا نعطّل أي عملية أساسية بسببه
  }
}
