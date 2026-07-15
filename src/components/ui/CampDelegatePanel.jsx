import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { getCampDelegateInfo } from '../../lib/helpers';
import colors from '../../theme/colors';

/**
 * لوحة مركزية موحّدة تُستخدم بكل شاشات التصدير (نساء/رجال/أطفال/صحة/
 * دراسة/توزيع/استيراد وتصدير) -- بدل ما كل شاشة تكتب نسختها الخاصة
 * (كان هذا بالضبط سبب التفاوت: بعض الشاشات عندها عرض المندوب المرئي
 * وزر إخفاء البانر، وبعضها ما عندها ولا وحدة منهم).
 *
 * تعرض:
 * 1) صندوق مرئي فوري بعد اختيار مخيم -- اسم المندوب وجواله (أو تحذير
 *    "لا يوجد مندوب" لو مو معيّن)، عشان المستخدم يتأكد قبل حتى ما يصدّر.
 * 2) زر تفعيل/إخفاء "بيانات المخيم بأعلى ملف الإكسل" -- مفعّل افتراضياً.
 *
 * props:
 * - camp: كائن المخيم المختار حالياً (أو null/undefined لو "كل المخيمات")
 * - orgMembers: قائمة أعضاء المنظمة (لحساب المندوب)
 * - showBanner / onToggleBanner: حالة الزر، يديرها الأب (تُمرَّر لـgetBanner)
 */
export default function CampDelegatePanel({ camp, orgMembers, showBanner, onToggleBanner }) {
  if (!camp) return null;
  const delegate = getCampDelegateInfo(camp, orgMembers);
  const hasDelegate = !!delegate?.name;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.delegateNote, hasDelegate ? styles.delegateOk : styles.delegateWarn]}>
        {hasDelegate
          ? `✅ المندوب: ${delegate.name} — ${delegate.phone || '—'}`
          : '⚠️ لا يوجد مندوب معيَّن لهذا المخيم'}
      </Text>
      <View style={styles.bannerRow}>
        <Switch value={showBanner} onValueChange={onToggleBanner} trackColor={{ true: colors.accent }} />
        <Text style={styles.bannerLabel}>إظهار بيانات المخيم بأعلى ملف الإكسل</Text>
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
