import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Switch } from 'react-native';
import { getExportBannerLines, getCampDelegateInfo } from '../../lib/helpers';
import SelectField from './SelectField';
import colors from '../../theme/colors';

/**
 * لوحة مركزية موحّدة تُستخدم بكل شاشات التصدير -- تدير بانر ملف الإكسل
 * بالكامل (اختيار + معاينة + تفعيل/إخفاء) وترجعه جاهزاً للأب عبر
 * onBannerLinesChange، عشان دالة التصدير بكل شاشة تستخدمه مباشرة بدون
 * ما تعيد بناء منطق البانر بنفسها.
 *
 * قابلة للطي بنفس أسلوب FieldPicker بالضبط (رأس بعنوان+ملخص+سهم، مطوي
 * افتراضياً) -- عشان تنضم بصرياً لصندوق اختيار الحقول بدل ما تاخذ مساحة
 * دائمة منفصلة، خصوصاً بشاشة الاستيراد والتصدير اللي فيها أكثر من زر
 * تصدير بنفس الصفحة.
 *
 * سلوك حسب الدور (طلب صريح):
 * - مندوب المخيم / المساعد: بانر شخصي دائم باسمه هو، يظهر دايماً بغض
 *   النظر عن فلتر عرض البيانات (مخيمه المحدد أو "كل المخيمات") -- بلا
 *   أي منتقي مخيم (أصلاً محصور بمخيم واحد).
 * - مالك المنصة / مدير الإيواء: منتقي صريح **باسم المندوب** (وليس باسم
 *   المخيم) لأي مخيم من مخيماته المرئية (props.camps) لاختيار بانر
 *   الملف -- منفصل تماماً عن فلتر عرض البيانات (filterCamp)، يُستخدم
 *   فقط لتوليد أول قيمة افتراضية مريحة. المخيمات بلا مندوب معيَّن تظهر
 *   بالمنتقي بعلامة تحذير واضحة "⚠️ بدون مندوب (اسم المخيم)".
 *
 * props:
 * - profile: بروفايل المستخدم الحالي (من useAuth)
 * - camps: قائمة المخيمات المرئية للمستخدم (لمنتقي مالك المنصة/مدير الإيواء)
 * - filterCamp: مخيم فلتر عرض البيانات الحالي بالشاشة (لتوليد افتراضي البانر فقط)
 * - orgMembers: أعضاء المنظمة (لحساب مندوب المخيم المختار كبانر لدور owner/admin)
 * - showBanner / onToggleBanner: حالة تفعيل البانر، يديرها الأب
 * - onBannerLinesChange: يُستدعى بأسطر البانر الجاهزة (أو null) كلما تغيّرت
 * - startOpen: يفتح اللوحة موسّعة من البداية (اختياري، افتراضي: مطوية)
 */
export default function CampDelegatePanel({
  profile, camps, filterCamp, orgMembers, showBanner, onToggleBanner, onBannerLinesChange, startOpen = false,
}) {
  const isDelegateOrAssistant = profile?.role === 'camp_delegate' || profile?.role === 'assistant';
  const isOwnerOrAdmin = profile?.role === 'platform_owner' || profile?.role === 'super_admin';

  const [open, setOpen] = useState(startOpen);
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

  // مالك المنصة/مدير الإيواء يختار "باسم المندوب" مباشرة وليس باسم
  // المخيم (طلب صريح) -- نفس getCampDelegateInfo المركزية المستخدمة
  // لبناء البانر نفسه، فالاسم المعروض بالمنتقي مطابق دايماً للي رح
  // يطلع فعلياً بأعلى ملف الإكسل. camps تُمرَّر عشان المخيمات الفرعية
  // (بلا مندوب خاص فيها أبداً) تورّث مندوب مخيمها الرئيسي تلقائياً.
  const bannerDelegate = !isDelegateOrAssistant && bannerCamp ? getCampDelegateInfo(bannerCamp, orgMembers, camps) : null;
  const bannerCampLabel = bannerCamp
    ? `${bannerDelegate?.name || 'بدون مندوب'} — ${bannerCamp.name}`
    : null;
  // كل خيار "اسم المندوب — اسم المخيم" عشان يتوضّح فوراً أي مخيم بالضبط
  // (خصوصاً لما نفس المندوب يدير مخيمه الرئيسي + فروعه، فيتكرر اسمه
  // لأكثر من مخيم -- هذا طبيعي، مو خطأ، وإضافة اسم المخيم توضّحه). إزالة
  // أي مخيم مكرر بالقائمة نفسها (احتياط دفاعي لو مصدر camps فيه تكرار).
  const uniqueCamps = Array.from(new Map((camps || []).map((c) => [c.id, c])).values());
  const delegateOptions = !isDelegateOrAssistant
    ? uniqueCamps.map((c) => {
        const d = getCampDelegateInfo(c, orgMembers, camps);
        return { value: c.id, label: `${d?.name || '⚠️ بدون مندوب'} — ${c.name}` };
      })
    : [];

  useEffect(() => {
    const lines = showBanner ? getExportBannerLines(profile, bannerCamp, orgMembers, camps) : null;
    onBannerLinesChange?.(lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role, profile?.full_name, profile?.phone, bannerCamp?.id, showBanner, orgMembers, camps]);

  if (!profile) return null;

  const summary = !showBanner
    ? 'معطّل'
    : isDelegateOrAssistant
      ? `باسمك (${profile.full_name || '—'})`
      : bannerCampLabel || 'بدون بانر';

  return (
    <View style={styles.fieldPicker}>
      <Pressable style={styles.fieldPickerHeader} onPress={() => setOpen((o) => !o)}>
        <Text style={styles.fieldPickerTitle}>🏷️ بانر التصدير ({summary})</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open && (
        <View style={styles.fieldPickerBody}>
          {isDelegateOrAssistant && (
            <Text style={[styles.delegateNote, styles.delegateOk]}>
              ✅ سيظهر اسمك ({profile.full_name || '—'}) كـ{profile.role === 'camp_delegate' ? 'مندوب المخيم' : 'مساعد'} بأعلى ملف الإكسل دائماً
            </Text>
          )}

          {isOwnerOrAdmin && (
            <>
              <SelectField
                label="اختر مندوباً لعرض بيانات مخيمه بأعلى الملف"
                value={bannerCampLabel}
                placeholder="— بدون بانر —"
                options={[{ value: '', label: '— بدون بانر —' }, ...delegateOptions]}
                onSelect={setBannerCampId}
              />
              {!!bannerCamp && (
                <Text style={[styles.delegateNote, bannerDelegate?.name ? styles.delegateOk : styles.delegateWarn]}>
                  {bannerDelegate?.name
                    ? `🏷️ بانر المندوب "${bannerDelegate.name}" (مخيم ${bannerCamp.name}) مفعّل بأعلى الملف`
                    : `⚠️ مخيم "${bannerCamp.name}" بدون مندوب معيَّن -- سيظهر البانر بدون اسم مندوب`}
                </Text>
              )}
            </>
          )}

          <View style={styles.bannerRow}>
            <Switch value={showBanner} onValueChange={onToggleBanner} trackColor={{ true: colors.accent }} />
            <Text style={styles.bannerLabel}>إظهار البانر بأعلى ملف الإكسل</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldPicker: { backgroundColor: colors.surface2, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  fieldPickerHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  fieldPickerTitle: { color: colors.accent, fontWeight: '900', fontSize: 12 },
  chevron: { color: colors.muted, fontSize: 10 },
  fieldPickerBody: { paddingHorizontal: 12, paddingBottom: 12 },
  delegateNote: { fontSize: 12, fontWeight: 'bold', textAlign: 'right', marginBottom: 8, padding: 10, borderRadius: 10, overflow: 'hidden' },
  delegateOk: { color: colors.green, backgroundColor: 'rgba(16,185,129,0.12)' },
  delegateWarn: { color: colors.accent, backgroundColor: 'rgba(245,158,11,0.12)' },
  bannerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 4 },
  bannerLabel: { color: colors.muted, fontSize: 11 },
});
