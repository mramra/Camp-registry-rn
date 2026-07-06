import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/ui/PageHeader';
import FormSection from '../../components/ui/FormSection';
import colors from '../../theme/colors';

const TABLE_AR = {
  families: 'الأسر',
  family_members: 'الأفراد',
  camps: 'المخيمات',
  org_members: 'المستخدمون',
  family_movements: 'الحركات',
  dist_rounds: 'جولات التوزيع',
  camp_distributions: 'الدفعات',
  camp_dist_families: 'الاستلام',
};

export default function DiagnosticsScreen() {
  const [tests, setTests] = useState({});
  const [counts, setCounts] = useState({});
  const [running, setRunning] = useState(false);

  const runAll = useCallback(async () => {
    setRunning(true);
    const results = {};

    // الاتصال بالإنترنت — عبر NetInfo (بديل RN لـ navigator.onLine غير الموجود بالموبايل)
    const netState = await NetInfo.fetch();
    results.internet = { ok: !!netState.isConnected, detail: netState.isConnected ? 'متصل' : 'غير متصل' };

    const {
      data: { session },
    } = await supabase.auth.getSession();
    results.session = { ok: !!session, detail: session?.user?.email || 'بلا جلسة' };

    const t0 = Date.now();
    const { error: pingErr } = await supabase.from('families').select('id').limit(1);
    results.rest = { ok: !pingErr, detail: pingErr ? pingErr.message : `يعمل (${Date.now() - t0}ms)` };

    setTests(results);

    const c = {};
    for (const t of Object.keys(TABLE_AR)) {
      const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true });
      c[t] = error ? '—' : count;
    }
    setCounts(c);
    setRunning(false);
  }, []);

  useEffect(() => { runAll(); }, [runAll]);

  const TEST_ROWS = [
    ['internet', 'الاتصال بالإنترنت'],
    ['session', 'جلسة Supabase'],
    ['rest', 'Supabase REST'],
  ];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          icon="🩺"
          title="تشخيص النظام"
          subtitle={<Text style={styles.headerSubtitle}>حالة الاتصال بـ Supabase</Text>}
          action={
            <Pressable style={styles.refreshBtn} onPress={runAll} disabled={running}>
              <Text style={styles.refreshBtnText}>{running ? '⏳' : '🔄'} إعادة الفحص</Text>
            </Pressable>
          }
        />

        <FormSection title="">
          {TEST_ROWS.map(([key, label]) => {
            const t = tests[key];
            if (!t) return null;
            return (
              <View key={key} style={styles.testRow}>
                <Text style={styles.testLabel}>{label}</Text>
                <Text style={[styles.testValue, { color: t.ok ? colors.green : colors.red }]}>
                  {t.ok ? '✅' : '❌'} {t.detail}
                </Text>
              </View>
            );
          })}
        </FormSection>

        <FormSection title="📊 عدد السجلات في كل جدول">
          {Object.entries(TABLE_AR).map(([key, label]) => (
            <View key={key} style={styles.countRow}>
              <Text style={styles.countValue}>{counts[key] ?? '...'}</Text>
              <Text style={styles.countLabel}>{label}</Text>
            </View>
          ))}
        </FormSection>

        <FormSection title="">
          <Text style={styles.infoText}>
            ℹ️ هذا التطبيق يعمل مباشرة مع Supabase بدون تخزين محلي — كل قراءة وكتابة تذهب فوراً
            للسيرفر. لا حاجة لمزامنة أو "رفع بيانات محلية"، لأنه لا يوجد نسخة محلية أصلاً.
          </Text>
        </FormSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  refreshBtn: { backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  refreshBtnText: { color: '#000', fontWeight: '900', fontSize: 11 },

  testRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 10, padding: 12, marginBottom: 8 },
  testLabel: { color: colors.white, fontWeight: 'bold', fontSize: 12 },
  testValue: { fontWeight: 'bold', fontSize: 12 },

  countRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  countValue: { color: colors.accent, fontWeight: 'bold', fontSize: 13 },
  countLabel: { color: colors.white, fontSize: 12 },

  infoText: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: 'right' },
});
