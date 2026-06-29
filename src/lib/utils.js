/**
 * utils.js — دوال مساعدة مشتركة
 * منقول من camp-registry-react/src/lib/utils.js
 *
 * الفروقات عن نسخة الويب:
 *   - getDeviceFingerprint(): كانت sync مع localStorage، الآن async مع SecureStore
 *     (لأن SecureStore على React Native لا يوفر API متزامن).
 *     كل من يستخدمها يجب أن يستخدم await.
 *   - getDeviceName/getDeviceType: كانت تحلّل navigator.userAgent (غير موجود في RN)،
 *     الآن تعتمد على expo-device مباشرة.
 */
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

/**
 * بصمة ثابتة لهذا الجهاز — تُولَّد مرة واحدة وتبقى مخزَّنة بأمان عبر SecureStore.
 * مهم: هذه الدالة async (خلافاً لنسخة الويب المتزامنة) — استخدم await دائماً.
 */
export async function getDeviceFingerprint() {
  let fp = await SecureStore.getItemAsync(FINGERPRINT_KEY)
  if (!fp) {
    fp = generateId()
    await SecureStore.setItemAsync(FINGERPRINT_KEY, fp)
  }
  return fp
}

/** اسم وصفي لنظام الجهاز — مبني على expo-device بدل user agent */
export function getDeviceName() {
  const brand = Device.brand || ''
  const model = Device.modelName || ''
  if (Device.osName === 'Android') return `🤖 ${brand} ${model}`.trim() || '🤖 Android'
  if (Device.osName === 'iOS' || Device.osName === 'iPadOS') return `🍎 ${model}`.trim() || '🍎 iOS'
  return '🌐 جهاز غير معروف'
}

/** نوع الجهاز: mobile أو desktop — في React Native يكون mobile دائماً عملياً (الهواتف والأجهزة اللوحية) */
export function getDeviceType() {
  if (Device.deviceType === Device.DeviceType.DESKTOP) return 'desktop'
  return 'mobile'
}
