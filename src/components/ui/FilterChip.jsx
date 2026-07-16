import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

/**
 * شريحة فلتر قابلة للاختيار (بديل <select> على الويب) — تُستخدم بصفوف
 * الفلاتر بقوائم الأسر/المخيمات/إلخ. selected يغيّر الخلفية للون accent.
 */
export default function FilterChip({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { opacity: 0.8 },
  label: { color: colors.white, fontSize: 12, fontWeight: 'bold' },
  labelSelected: { color: '#1a1206' },
});
