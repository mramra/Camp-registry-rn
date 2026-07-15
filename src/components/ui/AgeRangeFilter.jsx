import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

/**
 * فلتر نطاق عمر موحّد (من/إلى + مسح) — يُستخدم بكل شاشات القوائم
 * (الأسر، النساء، الأطفال، الرجال...) بدل تكرار نفس الحقول بتنسيق
 * مختلف قليلاً بكل شاشة. label اختياري (افتراضياً "الفئة العمرية:").
 */
export default function AgeRangeFilter({ label = 'الفئة العمرية:', min, max, onChangeMin, onChangeMax, resultCount }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={min}
        onChangeText={onChangeMin}
        placeholder="من"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        style={styles.input}
      />
      <Text style={styles.dash}>—</Text>
      <TextInput
        value={max}
        onChangeText={onChangeMax}
        placeholder="إلى"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        style={styles.input}
      />
      {(!!min || !!max) && (
        <Pressable onPress={() => { onChangeMin(''); onChangeMax(''); }} style={styles.clear}>
          <Text style={styles.clearText}>✕ مسح</Text>
        </Pressable>
      )}
      {!!resultCount && (!min && !max ? false : true) && (
        <Text style={styles.count}>{resultCount}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  label: { color: colors.muted, fontSize: 12, marginStart: 4 },
  input: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, color: colors.white, fontSize: 13, textAlign: 'center', width: 64,
  },
  dash: { color: colors.muted },
  clear: { paddingHorizontal: 8, paddingVertical: 6 },
  clearText: { color: colors.red, fontSize: 11 },
  count: { color: colors.accent, fontSize: 11, fontWeight: 'bold' },
});
