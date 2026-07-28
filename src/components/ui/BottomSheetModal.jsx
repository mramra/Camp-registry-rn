import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import colors from '../../theme/colors';

/**
 * ورقة سفلية موحّدة (bottom sheet) — تُستخدم لقوائم الاختيار
 * (اختيار مخيم، فرز، إلخ) ولنماذج الإضافة/التعديل. مقابل مكوّن Modal
 * الأصلي بالويب.
 *
 * KeyboardAvoidingView + keyboardShouldPersistTaps مضافان عمداً لتفادي
 * حجب لوحة المفاتيح لزر الحفظ بالنماذج الطويلة. ملاحظة مهمة: behavior
 * 'height' بأندرويد جُرِّب أولاً لكنه عطّل التمرير بالكامل (حتى بدون
 * فتح الكيبورد إطلاقاً) -- تعارض معروف بين flex:1 وتعديل height
 * القسري لـKeyboardAvoidingView داخل Modal بأندرويد. الحل الآمن: بدون
 * behavior إطلاقاً بأندرويد (نعتمد بدلها على padding سفلي سخي
 * بالـScrollView + keyboardShouldPersistTaps)، وpadding فقط بـiOS.
 */
export default function BottomSheetModal({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕ إغلاق</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '75%',
    paddingTop: 16,
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: { color: colors.white, fontWeight: '900', fontSize: 14 },
  closeBtn: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  closeText: { color: colors.muted, fontSize: 11 },
  body: { paddingHorizontal: 16, paddingBottom: 140 },
});
