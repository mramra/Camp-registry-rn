import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

/**
 * منتقي حقول بالنقر مع رقم يوضّح ترتيب الاختيار (هذا الرقم = ترتيب
 * الأعمدة الفعلي بالملف المُصدَّر). كل حقل عبارة عن { key, label, order }
 * -- order=0 يعني غير محدَّد، order>0 يعني محدَّد بهذا الترتيب.
 *
 * مستخرج من ExportScreen.jsx الأصلية (كان محلياً غير قابل لإعادة
 * الاستخدام) عشان أي شاشة ثانية تحتاج نفس أسلوب اختيار الحقول (بالنقر،
 * مرقَّم، مو checkbox عادي) تقدر تستخدمه بدون تكرار الكود.
 */
export default function FieldPicker({ title, cols, onChange, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const selectedCount = cols.filter((c) => c.order > 0).length;

  const toggle = (key) => {
    const current = cols.find((c) => c.key === key);
    if (current.order > 0) {
      // إلغاء التحديد: صفّر رقمه، وأنزل رقم كل حقل كان بعده بواحد
      const removedOrder = current.order;
      onChange(
        cols.map((c) => {
          if (c.key === key) return { ...c, order: 0 };
          if (c.order > removedOrder) return { ...c, order: c.order - 1 };
          return c;
        })
      );
    } else {
      // تحديد جديد: ياخذ الرقم التالي بعد آخر رقم مستخدم
      const maxOrder = Math.max(0, ...cols.map((c) => c.order));
      onChange(cols.map((c) => (c.key === key ? { ...c, order: maxOrder + 1 } : c)));
    }
  };
  const selectAll = () => onChange(cols.map((c, i) => ({ ...c, order: i + 1 })));
  const selectNone = () => onChange(cols.map((c) => ({ ...c, order: 0 })));

  return (
    <View style={styles.fieldPicker}>
      <Pressable style={styles.fieldPickerHeader} onPress={() => setOpen((o) => !o)}>
        <Text style={styles.fieldPickerTitle}>{title} ({selectedCount})</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <View style={styles.fieldPickerBody}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <Pressable style={styles.miniBtn} onPress={selectAll}><Text style={styles.miniBtnText}>الكل</Text></Pressable>
            <Pressable style={styles.miniBtn} onPress={selectNone}><Text style={styles.miniBtnText}>لا شيء</Text></Pressable>
          </View>
          <View style={styles.chipsWrap}>
            {cols.map((c) => (
              <Pressable
                key={c.key}
                onPress={() => toggle(c.key)}
                style={[styles.chip, c.order > 0 && styles.chipActive]}
              >
                {c.order > 0 && (
                  <View style={styles.chipOrderBadge}>
                    <Text style={styles.chipOrderText}>{c.order}</Text>
                  </View>
                )}
                <Text style={[styles.chipText, c.order > 0 && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** يفرز الحقول المحددة حسب رقم ترتيب اختيارها (تصاعدياً) -- هذا الترتيب
 * هو ترتيب الأعمدة الفعلي بملف الإكسل المُصدَّر. */
export const orderedSelected = (cols) => cols.filter((c) => c.order > 0).sort((a, b) => a.order - b.order);

const styles = StyleSheet.create({
  fieldPicker: { backgroundColor: colors.surface2, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  fieldPickerHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  fieldPickerTitle: { color: colors.accent, fontWeight: '900', fontSize: 12 },
  chevron: { color: colors.muted, fontSize: 10 },
  fieldPickerBody: { paddingHorizontal: 12, paddingBottom: 12 },
  chipsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 11 },
  chipTextActive: { color: colors.accent, fontWeight: 'bold' },
  chipOrderBadge: { backgroundColor: colors.accent, borderRadius: 999, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  chipOrderText: { color: colors.bg, fontSize: 9, fontWeight: '900' },
  miniBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  miniBtnText: { color: colors.muted, fontSize: 10 },
});
