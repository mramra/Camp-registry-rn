import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../lib/permissions';
import PageHeader from '../../components/ui/PageHeader';
import FormSection from '../../components/ui/FormSection';
import { showToast } from '../../utils/toast';
import colors from '../../theme/colors';

const TABLES = [
  { key: 'families', label: 'الأسر', icon: '👨‍👩‍👧', hasOrg: true },
  { key: 'family_members', label: 'أفراد الأسر', icon: '👤', hasOrg: false },
  { key: 'camps', label: 'المخيمات', icon: '🏕️', hasOrg: true },
  { key: 'org_members', label: 'المستخدمون', icon: '👥', hasOrg: true },
  { key: 'family_movements', label: 'الحركات', icon: '🔄', hasOrg: true },
  { key: 'dist_rounds', label: 'جولات التوزيع', icon: '📦', hasOrg: true },
  { key: 'camp_distributions', label: 'دفعات التوزيع', icon: '📋', hasOrg: true },
  { key: 'camp_dist_families', label: 'استلام التوزيعات', icon: '✅', hasOrg: false },
];

export default function DataScreen() {
  const { profile, orgId, isOwner } = useAuth();
  const canExport = hasPermission(profile, 'reports') || isOwner;

  const [stats, setStats] = useState({});
  const [backing, setBacking] = useState(false);

  const loadStats = useCallback(() => {
    if (!orgId) return;
    TABLES.forEach(({ key, hasOrg }) => {
      (async () => {
        try {
          let q = supabase.from(key).select('*', { count: 'exact', head: true });
          if (hasOrg) q = q.eq('org_id', orgId);
          const { count } = await q;
          setStats((prev) => ({ ...prev, [key]: count ?? 0 }));
        } catch {
          setStats((prev) => ({ ...prev, [key]: '—' }));
        }
      })();
    });
  }, [orgId]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const totalRecords = Object.values(stats).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);

  const runFullBackup = async () => {
    if (!canExport) return showToast('لا تملك صلاحية النسخ الاحتياطي', 'error');
    setBacking(true);
    try {
      const wb = XLSX.utils.book_new();
      for (const { key, hasOrg, label } of TABLES) {
        let q = supabase.from(key).select('*');
        if (hasOrg) q = q.eq('org_id', orgId);
        const { data, error } = await q;
        if (error) throw error;
        const rows = data && data.length ? data : [{ ملاحظة: 'لا توجد بيانات' }];
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));
      }
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const fileUri = `${FileSystem.cacheDirectory}نسخة_احتياطية_كاملة_${dateStr}.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'نسخة احتياطية كاملة',
        });
      }
      showToast('تم إنشاء النسخة الاحتياطية', 'success');
    } catch (e) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setBacking(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader icon="🗄️" title="إدارة البيانات" subtitle={`${totalRecords} سجل إجمالاً`} />

        <FormSection title="📊 إحصائيات الجداول">
          {TABLES.map((t) => (
            <View key={t.key} style={styles.statRow}>
              <Text style={styles.statLabel}>{t.icon} {t.label}</Text>
              <Text style={styles.statValue}>
                {stats[t.key] === undefined ? <ActivityIndicator size="small" color={colors.accent} /> : stats[t.key]}
              </Text>
            </View>
          ))}
        </FormSection>

        <FormSection title="💾 النسخ الاحتياطي">
          {canExport ? (
            <>
              <Text style={styles.backupNote}>
                يصدّر كل جداول المنظمة ({TABLES.length} جدول) في ملف Excel واحد متعدد الأوراق.
              </Text>
              <Pressable style={styles.backupBtn} onPress={runFullBackup} disabled={backing}>
                <Text style={styles.backupBtnText}>
                  {backing ? '⏳ جاري إنشاء النسخة...' : '📥 تصدير نسخة احتياطية كاملة'}
                </Text>
              </Pressable>
              <View style={styles.comingSoonBox}>
                <Text style={styles.comingSoonText}>
                  🚧 استعادة نسخة احتياطية من ملف — قيد التطوير، غير متاحة حالياً.
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.lockedText}>🔒 لا تملك صلاحية النسخ الاحتياطي</Text>
          )}
        </FormSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  statRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  statLabel: { color: colors.white, fontSize: 12, fontWeight: 'bold' },
  statValue: { color: colors.accent, fontWeight: '900', fontSize: 14, minWidth: 24, textAlign: 'center' },

  backupNote: { color: colors.muted, fontSize: 11, marginBottom: 10, textAlign: 'right', lineHeight: 17 },
  backupBtn: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  backupBtnText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  comingSoonBox: { backgroundColor: colors.surface2, borderRadius: 12, padding: 12, marginTop: 10 },
  comingSoonText: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 17 },
  lockedText: { color: colors.red, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
});
