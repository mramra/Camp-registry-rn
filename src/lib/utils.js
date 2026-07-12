/**
 * utils.js — دوال مساعدة مشتركة
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// أسماء الأشهر العربية — مستخدمة بدل Intl.DateTimeFormat عمداً، لأن Hermes
// على أندرويد له نفس فئة الأخطاء الموثّقة (facebook/hermes#867, #602) مع
// أي واجهة Intl (بما فيها toLocaleDateString/toLocaleString بمعامل لغة) —
// نفس السبب الجذري اللي عطّل شاشة السجلات سابقاً، فتجنّبناه هنا استباقياً
// قبل ما يسبب نفس المشكلة بشاشات الحركات/التوزيعات/تفاصيل الأسرة.
const AR_MONTHS_SHORT = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return String(dateStr);
  return `${d.getDate()} ${AR_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return String(dateStr);
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const period = h < 12 ? 'ص' : 'م';
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(dateStr)} — ${hour12}:${minutes} ${period}`;
}

export function truncate(str, len = 30) {
  return str && str.length > len ? str.slice(0, len) + '…' : str
}

/**
 * معرّف فريد -- crypto.randomUUID() خاص بمتصفحات الويب فقط، غير موجود
 * إطلاقاً على محرك Hermes (أندرويد/iOS الحقيقي)، فاستخدامه المباشر كان
 * يكسر أي شاشة تستدعي هذي الدالة (شاشة الأجهزة، بصمة الجهاز، إلخ) بخطأ
 * "Property 'crypto' doesn't exist" على الجوال الحقيقي فقط -- الويب ما
 * كان يكشفها لأن المتصفح فعلاً عنده crypto.randomUUID أصلي. توليد UUID v4
 * يدوي هنا بديل يشتغل بكل مكان بدون أي اعتماد إضافي.
 */
export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  })
}

export function randomPassword(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefghjkmnpqrstwxyz23456789'
  return Array.from({ length }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

// ════════════════════════════════════════════════════════════
// بصمة الجهاز — مشتركة بين فحص الدخول (AuthContext) وصفحة الأجهزة (Devices.jsx)
// ════════════════════════════════════════════════════════════

/** بصمة ثابتة لهذا المتصفح/الجهاز — تُولَّد مرة واحدة وتبقى مخزَّنة محلياً */
/**
 * بصمة جهاز ثابتة (تُخزَّن مرة واحدة وتبقى نفسها بكل مرة) —
 * AsyncStorage بدل localStorage (غير موجود على React Native).
 * أصبحت async بالضرورة (AsyncStorage غير متزامن)؛ عكس الأصل على الويب.
 */
export async function getDeviceFingerprint() {
  const KEY = 'device_fingerprint';
  let fp = await AsyncStorage.getItem(KEY);
  if (!fp) {
    fp = generateId();
    await AsyncStorage.setItem(KEY, fp);
  }
  return fp;
}

/** اسم وصفي للجهاز — Platform.OS بدل تحليل user agent (غير موجود على الموبايل) */
export function getDeviceName() {
  if (Platform.OS === 'android') return '🤖 تطبيق أندرويد';
  if (Platform.OS === 'ios') return '🍎 تطبيق iOS';
  return '🌐 متصفح ويب';
}

/** نوع الجهاز — على تطبيق React Native فعلي، دايماً "mobile" */
export function getDeviceType() {
  // قيد قاعدة البيانات (devices_device_type_check) يسمح فقط بـ
  // mobile/tablet/desktop -- 'web' كانت تكسر الإدراج فعلياً عند تسجيل
  // الدخول من المتصفح (اكتُشف بمحاولة تصحيح بيانات قديمة، مو باختبار
  // فعلي -- كانت لتنكسر بصمت أول تسجيل دخول ويب بعد النشر السابق).
  return Platform.OS === 'web' ? 'desktop' : 'mobile';
}
