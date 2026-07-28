import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import colors from '../../theme/colors';

/**
 * ورقة سفلية موحّدة (bottom sheet) — تُستخدم لقوائم الاختيار
 * (اختيار مخيم، فرز، إلخ) ولنماذج الإضافة/التعديل. مقابل مكوّن Modal
 * الأصلي بالويب.
 *
 * KeyboardAvoidingView + keyboardShouldPersistTaps مضافان عمداً: بدونهما
 * لوحة المفاتيح بأندرويد (Modal له سلوك نافذة منفصل عن باقي الشاشة، ما
 * يرث إعدادات windowSoftInputMode للتطبيق تلقائياً) كانت تحجب زر
 * الحفظ/الإضافة بأي نموذج طويل نسبياً (أكثر من 5-6 حقول)، فيبدو للمستخدم
 * وكأن الزر "مش ظاهر" أو "ما بيوصلّه" رغم إنه موجود فعلياً تحت لوحة
 * المفاتيح مباشرة. إصلاح مركزي واحد هنا يغطي كل الشاشات اللي تستخدم
 * هذا المكوّن دفعة واحدة.
 */
export default function BottomSheetModal({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
  body: { paddingHorizontal: 16, paddingBottom: 20 },
});
