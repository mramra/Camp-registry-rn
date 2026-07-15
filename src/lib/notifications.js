import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// طريقة عرض الإشعار وقت وصوله والتطبيق مفتوح بالمقدمة (foreground) --
// بدونها إشعارات المقدمة ما تظهر إطلاقاً على أندرويد بمكتبة expo-notifications.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
