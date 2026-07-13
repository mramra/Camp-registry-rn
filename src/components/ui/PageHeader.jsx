import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

/**
 * ترويسة صفحة موحّدة — أيقونة + عنوان + عنوان فرعي + إجراء اختياري (زر/أزرار).
 * مطابقة لمكوّن PageHeader الأصلي (src/components/ui/PageHeader.jsx بالمشروع الويب).
 */
export default function PageHeader({ icon, title, subtitle, action }) {
  return (
    <View style={styles.row}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>
          {icon ? `${icon} ` : ''}{title}
        </Text>
        {!!subtitle && <View style={styles.subtitle}>{subtitle}</View>}
      </View>
      {!!action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleBlock: { flex: 1 },
  title: { color: colors.white, fontWeight: '900', fontSize: 18, textAlign: 'center' },
  subtitle: { marginTop: 4, alignItems: 'center' },
  action: { flexDirection: 'row', gap: 8 },
});
