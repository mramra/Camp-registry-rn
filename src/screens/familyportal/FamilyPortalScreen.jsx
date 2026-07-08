import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getFamilyCategories, CATEGORY_LABELS } from '../../lib/helpers';
import colors from '../../theme/colors';

// نفس معرّف المنظمة الثابت المستخدم بالنسخة الأصلية لبوابة الأسرة العامة
// (هذه الشاشة تعمل بدون تسجيل دخول، فلا يوجد AuthContext لأخذ org_id منه)
const ORG_ID = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5';

const ECON_LABELS = {
  extreme_poverty: 'فقر مدقع',
  poor: 'فقير',
  worker: 'عامل / متوسط',
  employee: 'موظف / متوسط',
  well_off: 'ميسور',
};

export default function FamilyPortalScreen({ navigation }) {
  const [nationalId, setNationalId] = useState('');
  const [dob, setDob] = useState('');
  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!nationalId.trim()) return setError('أدخل رقم الهوية');
    setLoading(true);
    setError('');
    setFamily(null);
    setMembers([]);
    try {
      const { data, error: err } = await supabase
        .from('families')
        .select('*, camps(name)')
        .eq('org_id', ORG_ID)
        .eq('head_id', nationalId.trim())
        .single();

      if (err || !data) {
        setError('لم يتم العثور على أي سجل بهذا الرقم');
        return;
      }

      // التحقق من تاريخ الميلاد إن أُدخل (صيغة YYYY-MM-DD)
      if (dob.trim() && data.head_dob) {
        const entered = dob.trim();
        const stored = String(data.head_dob).slice(0, 10);
        if (entered !== stored) {
          setError('رقم الهوية وتاريخ الميلاد غير متطابقين');
          return;
        }
      }

      setFamily(data);
      const { data: mems } = await supabase.from('family_members').select('*').eq('family_id', data.id);
      setMembers(mems || []);
    } catch {
      setError('حدث خطأ في البحث');
    } finally {
      setLoading(false);
    }
  };

  const categories = family ? getFamilyCategories(family, members) : [];

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Text style={styles.iconEmoji}>🏕️</Text>
            </View>
            <Text style={styles.title}>بوابة الأسرة</Text>
            <Text style={styles.subtitle}>استعلم عن بياناتك ومستجدات أسرتك</Text>

            <Text style={styles.label}>رقم هوية رب الأسرة *</Text>
            <TextInput
              value={nationalId}
              onChangeText={setNationalId}
              placeholder="1xxxxxxxxx"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              editable={!loading}
              style={styles.input}
            />

            <Text style={styles.label}>تاريخ الميلاد (للتحقق — اختياري، YYYY-MM-DD)</Text>
            <TextInput
              value={dob}
              onChangeText={setDob}
              placeholder="1990-01-01"
              placeholderTextColor={colors.muted}
              editable={!loading}
              style={styles.input}
            />

            {!!error && <Text style={styles.errorMsg}>{error}</Text>}

            <Pressable
              onPress={handleSearch}
              disabled={loading}
              style={[styles.button, loading && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>{loading ? '⏳ جاري البحث...' : '🔍 استعلام'}</Text>
            </Pressable>

            {family && (
              <View style={styles.resultsBox}>
                <View style={styles.foundBanner}>
                  <Text style={styles.foundBannerText}>✅ تم العثور على السجل</Text>
                </View>

                <View style={styles.infoCard}>
                  <Text style={styles.infoCardTitle}>👤 بيانات الأسرة</Text>
                  {[
                    ['اسم رب الأسرة', family.head_name],
                    ['رقم الهوية', family.head_id],
                    ['المخيم', family.camps?.name || '—'],
                    ['الخيمة', family.tent || '—'],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{k}</Text>
                      <Text style={styles.infoValue}>{v || '—'}</Text>
                    </View>
                  ))}
                </View>

                {(categories.length > 0 || family.economic_level) && (
                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardTitle}>🏷️ الفئات</Text>
                    <View style={styles.tagsRow}>
                      {categories.map((c) => (
                        <View key={c} style={styles.tag}>
                          <Text style={styles.tagText}>{CATEGORY_LABELS[c] || c}</Text>
                        </View>
                      ))}
                    </View>
                    {!!family.economic_level && (
                      <Text style={styles.econText}>
                        💰 {ECON_LABELS[family.economic_level] || family.economic_level}
                      </Text>
                    )}
                  </View>
                )}

                {members.length > 0 && (
                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardTitle}>👨‍👩‍👧‍👦 أفراد الأسرة ({members.length})</Text>
                    {members.slice(0, 5).map((m) => (
                      <View key={m.id} style={styles.memberRow}>
                        <Text style={styles.memberName}>{m.name}</Text>
                        <Text style={styles.memberRelation}>{m.relation}</Text>
                      </View>
                    ))}
                    {members.length > 5 && (
                      <Text style={styles.moreText}>+{members.length - 5} أخرى</Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>

          <Text style={styles.footerText}>للاستفسار تواصل مع إدارة المخيم</Text>

          {navigation?.canGoBack?.() && (
            <Pressable onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
              <Text style={styles.backLink}>‹ العودة لتسجيل الدخول</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 384,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 24,
  },
  iconBox: {
    width: 64,
    height: 64,
    backgroundColor: colors.accent,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  iconEmoji: { fontSize: 30 },
  title: { color: colors.white, fontWeight: '900', fontSize: 20, textAlign: 'center', marginBottom: 4 },
  subtitle: { color: colors.muted, fontSize: 12, textAlign: 'center', marginBottom: 24 },
  label: { color: colors.muted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, textAlign: 'right' },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'right',
  },
  errorMsg: {
    color: colors.red,
    fontSize: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    textAlign: 'right',
  },
  button: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.bg, fontWeight: '900', fontSize: 14, textAlign: 'center' },

  resultsBox: { marginTop: 20, gap: 12 },
  foundBanner: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  foundBannerText: { color: colors.green, fontWeight: 'bold', fontSize: 13 },

  infoCard: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  infoCardTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 12, marginBottom: 10, textAlign: 'right' },
  infoRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingBottom: 6, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { color: colors.muted, fontSize: 11 },
  infoValue: { color: colors.white, fontSize: 11, fontWeight: 'bold' },

  tagsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { color: colors.accent, fontSize: 10, fontWeight: 'bold' },
  econText: { color: colors.muted, fontSize: 11, marginTop: 8, textAlign: 'right' },

  memberRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberName: { color: colors.white, fontSize: 11 },
  memberRelation: { color: colors.muted, fontSize: 10 },
  moreText: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },

  footerText: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 16 },
  backLink: { color: colors.accent, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
});
