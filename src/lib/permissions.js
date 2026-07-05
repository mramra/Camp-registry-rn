/**
 * permissions.js — نظام الصلاحيات المركزي (منقول من camp-registry-react)
 * platform_owner > super_admin > camp_delegate > assistant
 *
 * صلاحيات الأفعال العامة فقط بهذه المرحلة (write/edit/delete/reports/admin).
 * صلاحيات الصفحات التفصيلية (page_permissions) مؤجّلة لمرحلة لاحقة.
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
  registers: { label: '📋 السجلات' },
  women: { label: '👩 النساء' },
  children: { label: '🧒 سجل الأطفال' },
  health_report: { label: '⚕️ كشف الحالات الصحية' },
  education_status: { label: '🎒 الحالة الدراسية' },
  analysis: { label: '📊 التحليل' },
  needs_report: { label: '📋 تقارير الاحتياجات' },
  camp_compare: { label: '🏕️ مقارنة المخيمات' },
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

export default { hasPermission, getCreatableRoles };
