/**
 * FilterChips.jsx — شريط اختيار أفقي (فلترة سريعة بشرائح)
 * مكوّن عام مستخلص من FamiliesScreen، قابل للاستخدام في كل الشاشات
 * التي تحتاج فلاتر أفقية قابلة للتمرير (Camps, Users, Movements...).
 *
 * Props:
 *   label   — عنوان فوق الشرائح (نص)
 *   value   — القيمة المختارة حالياً
 *   onChange — دالة تُستدعى بالقيمة الجديدة عند الاختيار
 *   options — [{ value, label }] قائمة الخيارات
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, radius } from '../../theme'

export default function FilterChips({ label, value, onChange, options }) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {options.map(o => {
            const active = o.value === value
            return (
              <TouchableOpacity
                key={String(o.value)}
                onPress={() => onChange(o.value)}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: { color: colors.white, fontSize: 11, fontWeight: '600' },
  chipTextActive: { color: colors.bg, fontWeight: '800' },
})
