import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

/**
 * حالة "لا بيانات" موحّدة — أيقونة + عنوان + نص فرعي + زر إجراء اختياري.
 * مطابقة لمكوّن EmptyState الأصلي.
 */
export default function EmptyState({ icon = '📭', title, subtitle, actionLabel, onAction }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      {!!title && <Text style={styles.title}>{title}</Text>}
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!actionLabel && (
        <Pressable style={styles.btn} onPress={onAction}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 32 },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { color: colors.white, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 12, marginBottom: 16, textAlign: 'center' },
  btn: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  btnText: { color: '#000', fontWeight: '900', fontSize: 13 },
});
