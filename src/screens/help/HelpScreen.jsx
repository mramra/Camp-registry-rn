import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import PageHeader from '../../components/ui/PageHeader';
import FormSection from '../../components/ui/FormSection';
import colors from '../../theme/colors';

const FAQ = [
  { q: 'كيف أضيف أسرة جديدة؟', a: 'من "قائمة الأسر" اضغط زر ＋ إضافة أعلى الصفحة.' },
  { q: 'كيف يعمل النظام بدون إنترنت؟', a: 'التطبيق يعمل مباشرة مع Supabase ويحتاج اتصالاً بالإنترنت لكل عملية قراءة أو حفظ — لا يوجد تخزين محلي أو مزامنة لاحقة.' },
  { q: 'كيف أنقل أسرة بين مخيمات؟', a: 'من صفحة "حركات الأسر" اضغط إضافة واختر نوع "نقل بين مخيمات".' },
  { q: 'ما هو الفرق بين الأدوار؟', a: 'مدير الإيواء: يرى كل شيء. مندوب المخيم: يدير مخيمه فقط. المساعد: صلاحيات محدودة حسب ما يحدده مندوب المخيم.' },
  { q: 'كيف أصدّر البيانات؟', a: 'من صفحة "استيراد/تصدير" اضغط تصدير Excel.' },
  { q: 'كيف أغيّر كلمة المرور؟', a: 'من صفحة الإعدادات ← تغيير كلمة المرور.' },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable style={styles.faqItem} onPress={() => setOpen((o) => !o)}>
      <View style={styles.faqHeader}>
        <Text style={styles.faqQ}>{q}</Text>
        <Text style={[styles.chevron, open && styles.chevronOpen]}>▼</Text>
      </View>
      {open && <Text style={styles.faqA}>{a}</Text>}
    </Pressable>
  );
}

export default function HelpScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader icon="❓" title="المساعدة والدعم" />

        <FormSection title="💬 الأسئلة الشائعة">
          {FAQ.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </FormSection>

        <FormSection title="📞 التواصل">
          <View style={styles.contactRow}>
            <Text style={styles.contactIcon}>📧</Text>
            <Text style={styles.contactText}>support@camp-registry.com</Text>
          </View>
          <View style={styles.contactRow}>
            <Text style={styles.contactIcon}>🌐</Text>
            <Text style={styles.contactText}>github.com/mramra/Camp-registry-rn</Text>
          </View>
          <View style={[styles.contactRow, { marginBottom: 0 }]}>
            <Text style={styles.contactIcon}>📱</Text>
            <Text style={styles.contactText}>الإصدار v1.0 — React Native</Text>
          </View>
        </FormSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  faqItem: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  faqHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  faqQ: { color: colors.white, fontWeight: 'bold', fontSize: 13, flex: 1, textAlign: 'right' },
  chevron: { color: colors.muted, fontSize: 10, marginStart: 8 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  faqA: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 8, textAlign: 'right' },

  contactRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
  contactIcon: { fontSize: 15 },
  contactText: { color: colors.muted, fontSize: 12 },
});
