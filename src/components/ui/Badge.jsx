import React from 'react';
import { Text, StyleSheet } from 'react-native';

/**
 * شارة نصية صغيرة ملوّنة — لعرض حالة/تنبيه ضمن بطاقة (ناقص، هوية مكررة...).
 * color: لون النص، bg: لون الخلفية (اختياري، افتراضياً نفس اللون بشفافية).
 */
export default function Badge({ label, color, bg }) {
  return (
    <Text style={[styles.badge, { color, backgroundColor: bg || `${color}26` }]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
