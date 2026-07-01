/**
 * utils.js — دوال مساعدة مشتركة
 * منقول من camp-registry-react/src/lib/utils.js
 *
 * الفروقات عن نسخة الويب:
 *   - getDeviceFingerprint(): كانت sync مع localStorage، الآن async مع SecureStore
 *     على أندرويد/iOS (لأن SecureStore لا يوفر API متزامن). كل من يستخدمها
 *     يجب أن يستخدم await.
 *   - getDeviceName/getDeviceType: كانت تحلّل navigator.userAgent (متاح فقط
 *     على الويب)، الآن تعتمد على expo-device على أندرويد/iOS.
 *
 * ⚠️ دعم منصة الويب (1 يوليو 2026): expo-secure-store غير مدعومة على الويب
 * إطلاقاً (isAvailableAsync يُرجع true على أندرويد/iOS فقط حسب توثيق Expo
 * الرسمي) — استدعاؤها هناك يُرجع Promise معلَّقة بلا حل ولا رفض، فتُعلِّق
 * تسجيل الدخول بالكامل بصمت (لا خطأ ظاهر، فقط "جاري الدخول" أبدياً).
 * الحل: تفرّع بحسب Platform.OS — localStorage على الويب (متاح دائماً في
 * المتصفحات)، SecureStore على أندرويد/iOS كما كان. هذا الفرع مطلوب فقط
 * لأن هذا المشروع يُصدَّر أيضاً كمعاينة ويب سريعة عبر GitHub Pages
 * (انظر .github/workflows/deploy-web.yml) بجانب التطبيق الأساسي (APK).
 */
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import * as Device from 'expo-device'

export function formatDate(dateStr, locale = 'ar-EG') {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch { return dateStr }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleString('ar-EG', {
      dateStyle: 'short', timeStyle: 'short',
    })
  } catch { return dateStr }
}

export function truncate(str, len = 30) {
  return str && str.length > len ? str.slice(0, len) + '…' : str
}

/** توليد UUID — متاح أصلاً في React Native الحديث عبر crypto.randomUUID مع polyfill خفيف للأمان */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // fallback بسيط (نادراً ما يُستخدم؛ Hermes الحديث يدعم crypto.randomUUID مباشرة)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function randomPassword(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefghjkmnpqrstwxyz23456789'
  return Array.from({ length }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

// ════════════════════════════════════════════════════════════
// بصمة الجهاز — مشتركة بين فحص الدخول (AuthContext) وصفحة الأجهزة (Devices)
// ════════════════════════════════════════════════════════════

const FINGERPRINT_KEY = 'device_fingerprint'
const isWeb = Platform.OS === 'web'

/**
 * بصمة ثابتة لهذا الجهاز — تُولَّد مرة واحدة وتبقى مخزَّنة بأمان
 * (SecureStore على أندرويد/iOS، localStorage على الويب).
 * مهم: هذه الدالة async دائماً (حتى على الويب، لتوحيد واجهة الاستخدام
 * وتفادي فروع async/sync متفرقة عند نقاط الاستدعاء) — استخدم await دائماً.
 */
export async function getDeviceFingerprint() {
  if (isWeb) {
    let fp = null
    try { fp = window.localStorage.getItem(FINGERPRINT_KEY) } catch { /* localStorage غير متاح (نادر) */ }
    if (!fp) {
      fp = generateId()
      try { window.localStorage.setItem(FINGERPRINT_KEY, fp) } catch { /* تجاهل فشل الكتابة */ }
    }
    return fp
  }
  let fp = await SecureStore.getItemAsync(FINGERPRINT_KEY)
  if (!fp) {
    fp = generateId()
    await SecureStore.setItemAsync(FINGERPRINT_KEY, fp)
  }
  return fp
}

/** اسم وصفي لنظام الجهاز — expo-device على أندرويد/iOS، تحليل بسيط لـ userAgent على الويب */
export function getDeviceName() {
  if (isWeb) {
    try {
      const ua = navigator.userAgent || ''
      if (/Android/i.test(ua)) return '🌐 متصفح (أندرويد)'
      if (/iPhone|iPad|iPod/i.test(ua)) return '🌐 متصفح (iOS)'
      return '🌐 متصفح ويب'
    } catch { return '🌐 متصفح ويب' }
  }
  const brand = Device.brand || ''
  const model = Device.modelName || ''
  if (Device.osName === 'Android') return `🤖 ${brand} ${model}`.trim() || '🤖 Android'
  if (Device.osName === 'iOS' || Device.osName === 'iPadOS') return `🍎 ${model}`.trim() || '🍎 iOS'
  return '🌐 جهاز غير معروف'
}

/** نوع الجهاز: mobile أو desktop — على الويب نخمّن من userAgent، على أندرويد/iOS mobile دائماً عملياً */
export function getDeviceType() {
  if (isWeb) {
    try {
      return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') ? 'mobile' : 'desktop'
    } catch { return 'desktop' }
  }
  if (Device.deviceType === Device.DeviceType.DESKTOP) return 'desktop'
  return 'mobile'
}
