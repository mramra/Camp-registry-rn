import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase, callAdminAPI } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import colors from '../../theme/colors';

const TABLE_AR = {
  camps: 'المخيمات',
  dist_rounds: 'جولات التوزيع',
  camp_distributions: 'دفعات التوزيع',
  families: 'الأسر',
  family_members: 'الأفراد',
  family_movements: 'حركات الأسر',
  family_history: 'سجل التغييرات/الموافقات',
  camp_dist_families: 'سجل الاستلام',
  org_members: 'المستخدمون',
};

const ROLE_AR = {
  super_admin: 'مدير إيواء',
  camp_delegate: 'مندوب مخيم',
  assistant: 'مساعد',
};

export default function SecurityAuditScreen() {
  const { orgId, isOwner } = useAuth();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [campMap, setCampMap] = useState({});

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from('camps')
      .select('id,name')
      .eq('org_id', orgId)
      .then(({ data }) => setCampMap(Object.fromEntries((data || []).map((c) => [c.id, c.name]))));
  }, [orgId]);

  const runAudit = useCallback(async () => {
    setRunning(true);
    setError('');
    setReport(null);
    try {
      const data = await callAdminAPI('security_audit', {});
      setReport(data);
    } catch (e) {
      setError(e.message || 'فشل تشغيل الفحص');
      showError('فشل تشغيل الفحص: ' + e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const campName = (id) => campMap[id] || id?.slice(0, 8) || '—';

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.locked}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <Text style={styles.lockedText}>هذه الصفحة لمالك المنصة فقط</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader icon="🛡️" title="الفحص الأمني" subtitle={<Text style={styles.headerSubtitle}>فحص حقيقي لعزل المخيمات على مستوى القاعدة (RLS)</Text>} />

        <View style={styles.introCard}>
          <Text style={styles.introText}>
            يسجّل دخول مؤقتاً بهوية كل مستخدم (غير مالك المنصة) فعلياً، ويقرأ كل الجداول الحساسة
            بصلاحيته الحقيقية، ثم يقارن ما يراه بما يجب أن يراه حسب دوره ومخيمه. أي صف يظهر خارج
            النطاق المسموح = تسريب حقيقي يُكشف فوراً.
          </Text>
          <Pressable style={[styles.runBtn, running && styles.disabled]} onPress={runAudit} disabled={running}>
            {running ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.runBtnText}>🔍 تشغيل الفحص الآن</Text>
            )}
          </Pressable>
          {!!error && <Text style={styles.errorText}>⚠️ {error}</Text>}
        </View>

        {report && (
          <>
            <Text style={styles.metaText}>
              آخر فحص: {formatDateTime(report.checked_at)} — {report.targets_checked} مستخدم
            </Text>

            {report.report.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>لا يوجد مستخدمون لفحصهم (غير مالك المنصة)</Text>
              </View>
            )}

            {report.report.map((r, i) => (
              <View key={i} style={styles.reportCard}>
                <View style={styles.reportTop}>
                  <View>
                    <Text style={styles.memberName}>{r.member}</Text>
                    <Text style={styles.memberMeta}>
                      {ROLE_AR[r.role] || r.role}
                      {r.camp_id ? ` — ${campName(r.camp_id)}` : ''}
                    </Text>
                  </View>
                  {r.error ? (
                    <Text style={[styles.statusBadge, styles.statusUnknown]}>⚠️ تعذر الفحص</Text>
                  ) : r.has_leak ? (
                    <Text style={[styles.statusBadge, styles.statusLeak]}>🚨 تسريب</Text>
                  ) : (
                    <Text style={[styles.statusBadge, styles.statusSafe]}>✅ آمن</Text>
                  )}
                </View>

                {!!r.error && <Text style={styles.errorLine}>{r.error}</Text>}

                {!r.error && r.has_leak && (
                  <View style={styles.leaksBox}>
                    {r.tables.filter((t) => t.leaked).map((t) => (
                      <Text key={t.table} style={styles.leakLine}>
                        <Text style={styles.leakTable}>{TABLE_AR[t.table] || t.table}:</Text> يرى {t.rows} سجل
                        يشمل مخيمات خارج صلاحيته ({t.leaked_camps.map((c) => campName(c)).join('، ')})
                      </Text>
                    ))}
                  </View>
                )}

                {!r.error && !r.has_leak && (
                  <Text style={styles.safeLine}>{r.tables.length} جدول فُحص — كل البيانات ضمن النطاق المسموح فقط</Text>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },

  locked: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockedIcon: { fontSize: 48, marginBottom: 12 },
  lockedText: { color: colors.white, fontWeight: 'bold' },

  introCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 12 },
  introText: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: 'right', marginBottom: 12 },
  runBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  runBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  errorText: { color: colors.red, fontSize: 11, fontWeight: 'bold', marginTop: 8, textAlign: 'right' },

  metaText: { color: colors.muted, fontSize: 10, marginBottom: 8, textAlign: 'right' },
  emptyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: 12 },

  reportCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  reportTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  memberName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  memberMeta: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
  statusBadge: { fontSize: 10, fontWeight: 'bold', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusUnknown: { color: colors.muted, backgroundColor: colors.surface2 },
  statusLeak: { color: colors.red, backgroundColor: 'rgba(239,68,68,0.1)' },
  statusSafe: { color: colors.green, backgroundColor: 'rgba(16,185,129,0.1)' },
  errorLine: { color: colors.red, fontSize: 11, textAlign: 'right' },
  leaksBox: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
  leakLine: { color: colors.red, fontSize: 11, textAlign: 'right' },
  leakTable: { fontWeight: 'bold' },
  safeLine: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },
});
