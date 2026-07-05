import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { exportXLSX } from '../../lib/excelIO';
import { showError, showSuccess } from '../../utils/toast';
import colors from '../../theme/colors';

/**
 * زر تصدير Excel موحّد — يُستخدم بكل الشاشات (الأسر، السجلات...).
 * getRows: دالة (بدون معاملات) ترجع مصفوفة الصفوف وقت الضغط (lazy)
 */
export default function ExportButton({ getRows, sheetName, fileName, label = '📥 Excel' }) {
  const [exporting, setExporting] = useState(false);

  const handlePress = async () => {
    setExporting(true);
    try {
      const rows = getRows();
      await exportXLSX(rows, sheetName, fileName);
      showSuccess('تم تجهيز الملف للمشاركة/الحفظ');
    } catch (e) {
      showError(e.message || 'فشل التصدير');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Pressable onPress={handlePress} disabled={exporting} style={styles.btn}>
      {exporting ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={styles.text}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 8, paddingVertical: 4 },
  text: { color: colors.accent, fontWeight: 'bold', fontSize: 12 },
});
