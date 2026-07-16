import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import colors from '../../theme/colors';

/**
 * زر إجراء رئيسي موحّد — عريض بعرض الشاشة، خلفية accent، نص متوسط.
 * يُستخدم أسفل PageHeader مباشرة لإجراء رئيسي واحد بالصفحة (مثل
 * 'جولة توزيع جديدة'، 'أسرة جديدة'...) بدل زر صغير داخل رأس الصفحة.
 */
export default function PrimaryButton({ label, onPress, loading = false, disabled = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.btn, (disabled || loading) && styles.disabled, pressed && styles.pressed]}
    >
      {loading ? <ActivityIndicator color="#1a1206" size="small" /> : <Text style={styles.text}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: colors.glowShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  text: { color: '#1a1206', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },
});
