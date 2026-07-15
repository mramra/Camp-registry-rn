import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { exportXLSX, exportXLSXMultiSheetWithBanners } from '../../lib/excelIO';
import { showError, showSuccess } from '../../utils/toast';
import colors from '../../theme/colors';

/**
 * زر تصدير Excel موحّد — يُستخدم بكل الشاشات (الأسر، السجلات...).
 * getRows: دالة (بدون معاملات) ترجع مصفوفة الصفوف وقت الضغط (lazy)
 * getBanner: اختيارية -- دالة ترجع صفوف بانر (اسم مخيم + مندوب) وقت الضغط،
 * أو null لو ما فيه مخيم محدد (كشف "كل المخيمات" ما يستاهل بانر مخيم واحد).
 */
export default function ExportButton({ getRows, getBanner, sheetName, fileName, label = '📥 Excel' }) {
  const [exporting, setExporting] = useState(false);

  const handlePress = async () => {
    setExporting(true);
    try {
      const rows = getRows();
      const banner = getBanner ? getBanner() : null;
      if (banner) {
        await exportXLSXMultiSheetWithBanners([{ name: sheetName.slice(0, 31), banner, rows }], fileName);
      } else {
        await exportXLSX(rows, sheetName, fileName);
      }
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
  btn: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: colors.accent, fontWeight: 'bold', fontSize: 12 },
});
