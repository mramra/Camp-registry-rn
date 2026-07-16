import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useRoute } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import PageHeader from '../../components/ui/PageHeader';
import colors from '../../theme/colors';

/**
 * البطاقة الرقمية للأسرة -- رمز QR يشفّر معرّف الأسرة (family.id) بصيغة
 * "FAM:{id}" (بادئة ثابتة تسهّل على أي ماسح مستقبلي التعرّف إن هذا رمز
 * أسرة قبل محاولة الاستعلام). لا يشفّر بيانات حساسة (اسم/هوية) داخل
 * الرمز نفسه -- فقط المعرّف، والباقي يُجلب من قاعدة البيانات وقت المسح.
 */
export default function FamilyQRScreen() {
  const route = useRoute();
  const { familyId, headName, campName, tent } = route.params || {};

  return (
    <SafeAreaView style={styles.screen}>
      <PageHeader icon="🔲" title="البطاقة الرقمية" />
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.qrBox}>
            {familyId ? (
              <QRCode value={`FAM:${familyId}`} size={220} backgroundColor="#fff" color="#000" />
            ) : (
              <Text style={styles.errorText}>تعذّر إنشاء الرمز — الأسرة غير محدَّدة</Text>
            )}
          </View>
          <Text style={styles.headName}>{headName || '—'}</Text>
          <Text style={styles.subInfo}>
            {campName || '—'}{tent ? ` • خيمة ${tent}` : ''}
          </Text>
        </View>
        <Text style={styles.hint}>
          امسح هذا الرمز بنقطة التوزيع للوصول السريع لبيانات الأسرة بدل البحث بالاسم.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  qrBox: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  headName: { color: colors.white, fontWeight: '900', fontSize: 16, textAlign: 'center' },
  subInfo: { color: colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' },
  errorText: { color: colors.red, fontSize: 12, padding: 40 },
  hint: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 18, paddingHorizontal: 20 },
});
