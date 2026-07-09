import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * تخزين محلي للعرض فقط (قراءة) — يعمل حصراً على التطبيق (Android/iOS)،
 * ولا يتفعّل إطلاقاً على نسخة الويب (المتصفح أصلاً لا يُفتح إلا وهو متصل
 * بالإنترنت، فلا داعي لأي طبقة تخزين هناك).
 *
 * الإدخال/التعديل/الحذف تبقى تتطلب اتصالاً حقيقياً بالإنترنت دائماً —
 * هذا الملف لا يُستخدم إلا لحفظ آخر نسخة ناجحة من بيانات القراءة، لعرضها
 * وقت انقطاع الشبكة مع تنبيه واضح للمستخدم أنها بيانات محفوظة وليست حيّة.
 *
 * المفاتيح مبنية على معرّف المستخدم نفسه (offline_<key>_<userId>) — فكل
 * مستخدم يخزّن محلياً بالضبط نفس البيانات المفلترة اللي كانت تصله أصلاً
 * حسب دوره وصلاحياته (كل شاشة أصلاً تفلتر حسب getAllowedCampIds قبل ما
 * تعرض شي)، بدون أي بيانات إضافية غير مصرّح له بيها.
 */

export const isOfflineCacheSupported = Platform.OS !== 'web';

const buildKey = (key, userId) => `offline_${key}_${userId || 'anon'}`;

/** يحفظ نسخة ناجحة من بيانات القراءة مع وقت الحفظ */
export const cacheData = async (key, userId, data) => {
  if (!isOfflineCacheSupported) return;
  try {
    await AsyncStorage.setItem(
      buildKey(key, userId),
      JSON.stringify({ data, savedAt: new Date().toISOString() })
    );
  } catch {
    // فشل الحفظ المحلي لا يجب أن يوقف عرض البيانات الحيّة أبداً
  }
};

/** يرجع آخر نسخة محفوظة + وقت حفظها، أو null لو ما فيه شي محفوظ */
export const getCachedData = async (key, userId) => {
  if (!isOfflineCacheSupported) return null;
  try {
    const raw = await AsyncStorage.getItem(buildKey(key, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { data: parsed.data, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
};
