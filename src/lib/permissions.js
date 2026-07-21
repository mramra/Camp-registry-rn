/**
 * permissions.js — نظام الصلاحيات المركزي (منقول من camp-registry-react)
 * platform_owner > super_admin > camp_delegate > assistant
 *
 * قسمين: صلاحيات الأفعال العامة (write/edit/delete/reports/admin)، وصلاحيات
 * الصفحات التفصيلية (من يرى أي صفحة -- عبر canAccessPageSync + جدول
 * page_permissions، مطبَّقة بـAuthContext وAppDrawer).
 */

export function hasPermission(profile, action) {
  if (!profile) return false;
  const role = profile.role;

  switch (action) {
    case 'write':
      if (role === 'assistant') return profile.can_add === true;
      return ['platform_owner', 'super_admin', 'camp_delegate'].includes(role);

    case 'edit':
      if (role === 'assistant') return profile.can_edit === true;
      return ['platform_owner', 'super_admin', 'camp_delegate'].includes(role);

    case 'delete':
      if (role === 'assistant') return profile.can_delete === true;
      return ['platform_owner', 'super_admin', 'camp_delegate'].includes(role);

    case 'admin':
      return ['platform_owner', 'super_admin'].includes(role);

    case 'reports':
      return ['platform_owner', 'super_admin', 'camp_delegate'].includes(role);

    // كانت غائبتين كلياً رغم وجود عمودي can_export/can_import المخصَّصين
    // بجدول org_members -- التصدير كان يُقاس بصلاحية 'reports' العامة
    // (تمنع أي مساعد حتى لو مُنح can_export=true صراحة)، والاستيراد
    // كان يُقاس بصلاحية 'write' (can_add) بدل can_import المخصَّصة له.
    case 'export':
      if (role === 'assistant') return profile.can_export === true;
      return ['platform_owner', 'super_admin', 'camp_delegate'].includes(role);

    case 'import':
      if (role === 'assistant') return profile.can_import === true;
      return ['platform_owner', 'super_admin', 'camp_delegate'].includes(role);

    default:
      return false;
  }
}

export function getCreatableRoles(profile) {
  if (!profile) return [];
  switch (profile.role) {
    case 'platform_owner':
      return ['super_admin', 'camp_delegate', 'assistant'];
    case 'super_admin':
      return ['camp_delegate', 'assistant'];
    case 'camp_delegate':
      return ['assistant'];
    default:
      return [];
  }
}

// سجل الصفحات لإدارة الصلاحيات التفصيلية (منقول حرفياً من الأصل)
export const PAGE_REGISTRY = {
  dashboard: { label: '🏠 الرئيسية' },
  families: { label: '👨‍👩‍👧 قائمة الأسر' },
  camps: { label: '🏕️ المخيمات' },
  movements: { label: '🔄 حركات الأسر' },
  distributions: { label: '📦 التوزيعات' },
  activity_log: { label: '📝 آخر التعديلات على الأسر' },
  women: { label: '👩 النساء' },
  men: { label: '👨 الرجال' },
  children: { label: '🧒 سجل الأطفال' },
  health_records: { label: '🩺 سجل الحالات الصحية' },
  education_status: { label: '🎒 الحالة الدراسية' },
  analysis: { label: '📊 التحليل' },
  camp_compare: { label: '🏕️ مقارنة المخيمات' },
  needs_report: { label: '📋 تقرير الاحتياجات' },
  export: { label: '📤 الاستيراد والتصدير' },
  users: { label: '👥 المستخدمون' },
  audit: { label: '📝 سجل التغييرات' },
  alerts: { label: '🔔 التنبيهات' },
  data: { label: '🛠️ إدارة البيانات' },
  diagnostics: { label: '🩺 تشخيص النظام' },
  security_audit: { label: '🛡️ الفحص الأمني' },
  devices: { label: '📱 الأجهزة' },
  sms: { label: '✉️ الرسائل' },
  settings: { label: '⚙️ الإعدادات' },
  subscription: { label: '💳 الاشتراكات' },
  help: { label: '❓ المساعدة' },
  pending_requests: { label: '📋 الطلبات المعلّقة' },
};

/**
 * ═══ صلاحيات الصفحات التفصيلية (من يرى أي صفحة) ═══
 * كانت مؤجَّلة بالكامل بالنسخة السابقة: شاشة إدارة الصلاحيات كانت تحفظ
 * القيم بجدول page_permissions، بس ولا شاشة فعلياً تتحقق منها -- كل
 * الشاشات كانت تظهر للجميع بغض النظر عن الإعدادات. منقول الآن حرفياً
 * من camp-registry-react/src/lib/permissions.js.
 *
 * أولوية الفحص: تخصيص مستخدم محدَّد > تخصيص دور (من شاشة إدارة
 * الصلاحيات) > افتراضي النظام (DEFAULT_ROLE_ACCESS -- المساعد ممنوع من
 * أغلب الصفحات افتراضياً إلا لو صُرِّح له صراحة).
 */

/** فحص صلاحية صفحة معيّنة (نظام قديم خاص بالمساعد عبر allowed_pages — يبقى للتوافق الخلفي) */
export function hasPagePermission(profile, pageKey, op = 'view') {
  if (!profile) return false;
  const role = profile.role;
  if (['platform_owner', 'super_admin', 'camp_delegate'].includes(role)) return true;
  if (role === 'assistant') {
    try {
      const pages = typeof profile.allowed_pages === 'string'
        ? JSON.parse(profile.allowed_pages)
        : (profile.allowed_pages || {});
      const pagePerm = pages[pageKey];
      if (!pagePerm) return false;
      if (op === 'view') return pagePerm.view === true;
      return pagePerm[op] === true;
    } catch {
      return false;
    }
  }
  return false;
}

const LEGACY_PAGE_KEY_MAP = {
  families: 'page-families',
  movements: 'page-movements',
  distributions: 'page-dist',
  children: 'page-children',
};

const DEFAULT_ROLE_ACCESS = {
  platform_owner: () => true,
  super_admin: {
    dashboard: true, families: true, camps: true, movements: true, distributions: true, activity_log: true,
    women: true, men: true, children: true, health_records: true, education_status: true,
    analysis: true, camp_compare: true, needs_report: true, export: true,
    users: true, audit: true, alerts: true, data: false, diagnostics: true, security_audit: false,
    devices: true, sms: true, settings: true, subscription: true, help: true, page_permissions: false, pending_requests: true,
  },
  camp_delegate: {
    dashboard: true, families: true, camps: true, movements: true, distributions: true, activity_log: true,
    women: true, men: true, children: true, health_records: true, education_status: true,
    analysis: true, camp_compare: true, needs_report: true, export: true,
    users: true, audit: true, alerts: true, data: false, diagnostics: true, security_audit: false,
    devices: true, sms: true, settings: true, subscription: true, help: true, page_permissions: false, pending_requests: true,
  },
  assistant: {
    dashboard: true, families: false, camps: false, movements: false, distributions: false, activity_log: false,
    women: false, men: false, children: false, health_records: false, education_status: false,
    analysis: false, camp_compare: false, needs_report: false, export: false,
    users: false, audit: false, alerts: false, data: false, diagnostics: false, security_audit: false,
    devices: false, sms: false, settings: true, subscription: false, help: true, page_permissions: false, pending_requests: false,
  },
};

function defaultAccess(profile, pageKey) {
  const role = profile?.role;
  if (role === 'platform_owner') return true;
  if (role === 'assistant' && LEGACY_PAGE_KEY_MAP[pageKey]) {
    return hasPagePermission(profile, LEGACY_PAGE_KEY_MAP[pageKey], 'view');
  }
  const table = DEFAULT_ROLE_ACCESS[role];
  if (!table) return false;
  return table[pageKey] === true;
}

/**
 * هل هذا المستخدم (profile) يقدر يشوف هذي الصفحة الآن؟ rows = نتيجة
 * fetchAllPagePermissions (تُجلب مرة واحدة بـAuthContext وتُمرَّر هون).
 */
export function canAccessPageSync(profile, pageKey, rows) {
  if (!profile) return false;
  if (profile.role === 'platform_owner') return true;
  const userId = profile.user_id || profile.id;
  const userRow = rows.find((r) => r.scope === 'user' && r.scope_value === userId && r.page_key === pageKey);
  if (userRow) return userRow.allowed === true;
  const roleRow = rows.find((r) => r.scope === 'role' && r.scope_value === profile.role && r.page_key === pageKey);
  if (roleRow) return roleRow.allowed === true;
  return defaultAccess(profile, pageKey);
}

/**
 * هل هذا المستخدم (profile) مخوَّل لمراجعة طلب صادر عن مستخدم آخر (requesterUser)؟
 * منقول حرفياً من الأصل — يطابق منطق دالة SQL المستخدمة فعلياً بـ RLS،
 * هنا فقط لتصفية العرض بالواجهة (الحماية الحقيقية بقاعدة البيانات).
 */
export const ROLE_LABELS = {
  platform_owner: '👑 مالك المنصة',
  super_admin: '🔴 مدير الإيواء',
  camp_delegate: '🟠 مندوب المخيم',
  assistant: '🟡 مساعد',
};

/** نفس الأدوار بدون إيموجي -- كانت مكرَّرة محلياً بشكلين مختلفين قليلاً
 * (اختلاف كلمة واحدة) بشاشتي الإعدادات والفحص الأمني. */
export const ROLE_LABELS_PLAIN = {
  platform_owner: 'مالك المنصة',
  super_admin: 'مدير الإيواء',
  camp_delegate: 'مندوب مخيم',
  assistant: 'مساعد',
};

export function canUserReviewRequest(profile, requesterUser) {
  if (!profile || !requesterUser) return false;
  if (profile.role === 'platform_owner') return true;
  if (!profile.can_review_approvals) return false;

  if (profile.role === 'camp_delegate' && requesterUser.role === 'assistant') {
    return requesterUser.supervisor_id === profile.id;
  }
  if (profile.role === 'super_admin' && ['assistant', 'camp_delegate'].includes(requesterUser.role)) {
    return true;
  }
  return false;
}

export default { hasPermission, getCreatableRoles, canUserReviewRequest, hasPagePermission, canAccessPageSync };
