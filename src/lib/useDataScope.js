import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * hook يُحدد نطاق البيانات المسموح بها حسب دور المستخدم
 * (منقول من camp-registry-react/src/lib/useDataScope.js — نفس المنطق حرفياً)
 * المندوب والمساعد → مخيمهم فقط
 * مدير الإيواء → مخيماته
 * مالك المنصة → كل شيء
 *
 * ⚠️ الدوال ملفوفة بـ useCallback عمداً: أي شاشة تضعها ضمن قائمة
 * اعتماديات useCallback/useEffect (لتحميل البيانات) تحتاج هوية ثابتة
 * لهذه الدوال بين كل إعادة رسم، وإلا يتكرر التحميل بحلقة لا نهائية —
 * هذا كان يحدث فعلياً بشاشات التوزيعات وحركات الأسر قبل هذا الإصلاح.
 */
export function useDataScope() {
  const { profile, userRole } = useAuth();
  const isOwner = userRole === 'platform_owner';
  const isSuperAdmin = userRole === 'super_admin';

  const getAllowedCampIds = useCallback(
    (allCamps) => {
      if (!profile) return [];
      if (isOwner) return null; // كل شيء

      const campId = profile.camp_id;

      // مدير إيواء — يرى مخيماته (حيث manager_id = هو) + فروعها
      if (isSuperAdmin) {
        const managed = (allCamps || []).filter((c) => c.manager_id === profile.id);
        if (!managed.length) return null; // لم يُعيَّن بعد → يرى الكل
        const ids = new Set(managed.map((c) => c.id));
        (allCamps || []).forEach((c) => {
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
    },
    [profile, isOwner, isSuperAdmin]
  );

  const filterLocal = useCallback((items, campIds, campField = 'camp_id') => {
    if (campIds === null) return items;
    if (!campIds || campIds.length === 0) return [];
    const set = new Set(campIds);
    return items.filter((item) => set.has(item[campField]));
  }, []);

  const getVisibleCamps = useCallback(
    (allCamps) => {
      const campIds = getAllowedCampIds(allCamps);
      return filterLocal(allCamps, campIds, 'id');
    },
    [getAllowedCampIds, filterLocal]
  );

  return { getAllowedCampIds, filterLocal, getVisibleCamps, isOwner, isSuperAdmin };
}
