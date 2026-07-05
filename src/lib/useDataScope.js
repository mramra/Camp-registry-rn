import { useAuth } from '../context/AuthContext';

/**
 * hook يُحدد نطاق البيانات المسموح بها حسب دور المستخدم
 * (منقول من camp-registry-react/src/lib/useDataScope.js — نفس المنطق حرفياً،
 * مع تكييف بسيط: effectiveProfile → profile حسب واجهة AuthContext هنا)
 * المندوب والمساعد → مخيمهم فقط
 * مدير الإيواء → مخيماته
 * مالك المنصة → كل شيء
 */
export function useDataScope() {
  const { profile, userRole } = useAuth();
  const isOwner = userRole === 'platform_owner';
  const isSuperAdmin = userRole === 'super_admin';

  // معرّفات المخيمات المسموح بها (null = كل شيء)
  function getAllowedCampIds(allCamps) {
    if (!profile) return [];
    if (isOwner) return null; // كل شيء

    const campId = profile.camp_id;

    // مدير إيواء — يرى مخيماته (حيث manager_id = هو) + فروعها
    if (isSuperAdmin) {
      const managed = (allCamps || []).filter((c) => c.manager_id === profile.id);
      if (!managed.length) return null; // لم يُعيَّن بعد → يرى الكل
      const ids = new Set(managed.map((c) => c.id));
      allCamps.forEach((c) => {
        if (ids.has(c.parent_camp_id)) ids.add(c.id);
      });
      return [...ids];
    }

    if (campId) {
      // مندوب أو مساعد — مخيمه + فروعه
      const ids = new Set([campId]);
      (allCamps || []).forEach((c) => {
        if (c.parent_camp_id === campId) ids.add(c.id);
      });
      return [...ids];
    }

    return []; // لا مخيم → لا بيانات
  }

  /** فلترة قائمة بيانات (مصفوفة JS) حسب المخيمات المسموحة */
  function filterLocal(items, campIds, campField = 'camp_id') {
    if (campIds === null) return items;
    if (campIds.length === 0) return [];
    const set = new Set(campIds);
    return items.filter((item) => set.has(item[campField]));
  }

  /** فقط المخيمات المسموح للمستخدم رؤيتها */
  function getVisibleCamps(allCamps) {
    const campIds = getAllowedCampIds(allCamps);
    return filterLocal(allCamps, campIds, 'id');
  }

  return { getAllowedCampIds, filterLocal, getVisibleCamps, isOwner, isSuperAdmin };
}
