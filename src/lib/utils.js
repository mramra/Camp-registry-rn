/**
 * utils.js — دوال مساعدة مشتركة
 */

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

export function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)
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
export function getDeviceFingerprint() {
  const KEY = 'device_fingerprint'
  let fp = localStorage.getItem(KEY)
  if (!fp) {
    fp = generateId()
    localStorage.setItem(KEY, fp)
  }
  return fp
}

/** اسم وصفي لنظام الجهاز من user agent */
export function getDeviceName(ua = navigator.userAgent) {
  if (/Android/i.test(ua)) return '🤖 Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return '🍎 iOS'
  if (/Windows/i.test(ua)) return '🖥️ Windows'
  if (/Macintosh/i.test(ua)) return '💻 Mac'
  return '🌐 جهاز غير معروف'
}

/** نوع الجهاز: mobile أو desktop */
export function getDeviceType(ua = navigator.userAgent) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? 'mobile' : 'desktop'
}
