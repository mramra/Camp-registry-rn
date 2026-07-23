import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { getExportBannerLines } from '../../lib/helpers';
import SelectField from './SelectField';
import colors from '../../theme/colors';

/**
 * لوحة مركزية موحّدة تُستخدم بكل شاشات التصدير -- تدير بانر ملف الإكسل
 * بالكامل (اختيار + معاينة + تفعيل/إخفاء) وترجعه جاهزاً للأب عبر
 * onBannerLinesChange، عشان دالة التصدير بكل شاشة تستخدمه مباشرة بدون
 * ما تعيد بناء منطق البانر بنفسها.
 *
 * سلوك حسب الدور (طلب صريح):
 * - مندوب المخيم / المساعد: بانر شخصي دائم باسمه هو، يظهر دايماً بغض
 *   النظر عن فلتر عرض البيانات (مخيمه المحدد أو "كل المخيمات") -- بلا
 *   أي منتقي مخيم (أصلاً محصور بمخيم واحد).
 * - مالك المنصة / مدير الإيواء: منتقي صريح لأي مخيم من مخيماته المرئية
 *   (props.camps) لاختيار بانر الملف -- منفصل تماماً عن فلتر عرض
 *   البيانات (filterCamp)، يُستخدم فقط لتوليد أول قيمة افتراضية مريحة.
 *
 * props:
 * - profile: بروفايل المستخدم الحالي (من useAuth)
 * - camps: قائمة المخيمات المرئية للمستخدم (لمنتقي مالك المنصة/مدير الإيواء)
 * - filterCamp: مخيم فلتر عرض البيانات الحالي بالشاشة (لتوليد افتراضي البانر فقط)
 * - orgMembers: أعضاء المنظمة (لحساب مندوب المخيم المختار كبانر لدور owner/admin)
 * - showBanner / onToggleBanner: حالة تفعيل البانر، يديرها الأب
 * - onBannerLinesChange: يُستدعى بأسطر البانر الجاهزة (أو null) كلما تغيّرت
 */
export default function CampDelegatePanel({
  profile, camps, filterCamp, orgMembers, showBanner, onToggleBanner, onBannerLinesChange,
}) {
  const isDelegateOrAssistant = profile?.role === 'camp_delegate' || profile?.role === 'assistant';
  const isOwnerOrAdmin = profile?.role === 'platform_owner' || profile?.role === 'super_admin';

  const [bannerCampId, setBannerCampId] = useState(filterCamp || '');
  const lastFilterCamp = useRef(filterCamp);

  // لو تغيّر فلتر عرض البيانات (اختيار مخيم مختلف)، حدّث افتراضي بانر
  // مالك المنصة/مدير الإيواء تلقائياً معه -- طالما لسه ما بدّله يدوياً
  // لقيمة مختلفة عن الفلتر القديم.
  useEffect(() => {
    if (filterCamp !== lastFilterCamp.current) {
      setBannerCampId((prev) => (prev === lastFilterCamp.current ? filterCamp || '' : prev));
      lastFilterCamp.current = filterCamp;
    }
  }, [filterCamp]);

  // مندوب/مساعد: بانره الشخصي يستخدم مخيمه هو (لعرض اسم/إحداثيات
  // المخيم بالبانر لو أمكن)، مش أي اختيار يدوي.
  const ownCamp = isDelegateOrAssistant ? (camps || []).find((c) => c.id === profile?.camp_id) : null;
  const bannerCamp = isDelegateOrAssistant ? ownCamp : (camps || []).find((c) => c.id === bannerCampId) || null;

  useEffect(() => {
    const lines = showBanner ? getExportBannerLines(profile, bannerCamp, orgMembers) : null;
    onBannerLinesChange?.(lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role, profile?.full_name, profile?.phone, bannerCamp?.id, showBanner, orgMembers]);

  if (!profile) return null;

  return (
    <View style={styles.wrap}>
      {isDelegateOrAssistant && (
        <Text style={[styles.delegateNote, styles.delegateOk]}>
          ✅ سيظهر اسمك ({profile.full_name || '—'}) كـ{profile.role === 'camp_delegate' ? 'مندوب المخيم' : 'مساعد'} بأعلى ملف الإكسل دائماً
        </Text>
      )}

      {isOwnerOrAdmin && (
        <>
          <SelectField
            label="🏷️ بانر الملف (اختر مخيماً لعرض بياناته بأعلى الملف)"
            value={bannerCamp?.name}
            placeholder="— بدون بانر —"
            options={[{ value: '', label: '— بدون بانر —' }, ...(camps || []).map((c) => ({ value: c.id, label: c.name }))]}
            onSelect={setBannerCampId}
          />
          {!!bannerCamp && (
            <Text style={[styles.delegateNote, styles.delegateOk]}>
              🏕️ بانر مخيم "{bannerCamp.name}" مفعّل بأعلى الملف
            </Text>
          )}
        </>
      )}

      <View style={styles.bannerRow}>
        <Switch value={showBanner} onValueChange={onToggleBanner} trackColor={{ true: colors.accent }} />
        <Text style={styles.bannerLabel}>إظهار البانر بأعلى ملف الإكسل</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  delegateNote: { fontSize: 12, fontWeight: 'bold', textAlign: 'right', marginBottom: 8, padding: 10, borderRadius: 10, overflow: 'hidden' },
  delegateOk: { color: colors.green, backgroundColor: 'rgba(16,185,129,0.12)' },
  delegateWarn: { color: colors.accent, backgroundColor: 'rgba(245,158,11,0.12)' },
  bannerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  bannerLabel: { color: colors.muted, fontSize: 11 },
});
