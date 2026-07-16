import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import colors from '../../theme/colors';

/**
 * ورقة سفلية موحّدة (bottom sheet) — تُستخدم لقوائم الاختيار
 * (اختيار مخيم، فرز، إلخ). مقابل مكوّن Modal الأصلي بالويب.
 */
export default function BottomSheetModal({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕ إغلاق</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.body}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.glassSurface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    maxHeight: '75%',
    paddingTop: 16,
    shadowColor: colors.glowShadow,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  title: { color: colors.white, fontWeight: '900', fontSize: 14 },
  closeBtn: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  closeText: { color: colors.accent, fontSize: 11, fontWeight: 'bold' },
  body: { paddingHorizontal: 16, paddingBottom: 20 },
});
