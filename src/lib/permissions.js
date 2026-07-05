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

export default { hasPermission, getCreatableRoles };
