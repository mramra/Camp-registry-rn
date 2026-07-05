import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

/** قسم نموذج موحّد — عنوان + بطاقة surface2 تحوي الحقول. */
export default function FormSection({ title, children }) {
  return (
    <View style={styles.panel}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  title: { color: colors.accent, fontWeight: 'bold', fontSize: 13, marginBottom: 12, textAlign: 'right' },
});
