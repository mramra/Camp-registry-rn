import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { PAGE_REGISTRY } from '../../lib/permissions';
import { fetchAllPagePermissions, setPagePermission, clearPagePermission } from '../../lib/supabase';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import colors from '../../theme/colors';

const ROLES = [
  { key: 'super_admin', label: 'مدير الإيواء' },
  { key: 'camp_delegate', label: 'المندوب' },
  { key: 'assistant', label: 'المساعد' },
];

const STATES = [
  { key: 'true', allowed: true, icon: '✓', label: 'مسموح', color: colors.green },
  { key: 'false', allowed: false, icon: '✕', label: 'ممنوع', color: colors.red },
  { key: 'default', allowed: null, icon: '↺', label: 'افتراضي النظام', color: colors.muted },
];

// زر اختيار واحد مضغوط (بدل 3 أزرار مكدّسة) — يعرض الحالة الحالية،
// وبالضغط يفتح ورقة سفلية بخيارات واضحة (نفس نمط SelectField بالتطبيق).
const PermissionCell = ({ value, busy, onSet, roleLabel }) => {
  const [visible, setVisible] = useState(false);
  const current = STATES.find((s) => s.allowed === value) || STATES[2];

  return (
    <>
      <Pressable
        disabled={busy}
        onPress={() => setVisible(true)}
        style={[styles.cellBtn, { backgroundColor: `${current.color}22`, borderColor: `${current.color}66` }]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={current.color} />
        ) : (
          <Text style={[styles.cellIcon, { color: current.color }]}>{current.icon}</Text>
        )}
      </Pressable>

      <BottomSheetModal visible={visible} onClose={() => setVisible(false)} title={roleLabel || 'حالة الصلاحية'}>
        {STATES.map((s) => (
          <Pressable
            key={s.key}
            style={styles.sheetOption}
            onPress={() => {
              onSet(s.allowed);
              setVisible(false);
            }}
          >
            <Text style={[styles.sheetOptionIcon, { color: s.color }]}>{s.icon}</Text>
            <Text style={styles.sheetOptionText}>{s.label}</Text>
            {current.key === s.key && <Text style={styles.sheetOptionCheck}>●</Text>}
          </Pressable>
        ))}
      </BottomSheetModal>
    </>
  );
};

export default function PermissionsAdminScreen() {
  const { profile, orgId, isOwner } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      setRows(await fetchAllPagePermissions(orgId));
    } catch (e) {
      showError('خطأ في تحميل الصلاحيات: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const getValue = (role, pageKey) => {
    const r = rows.find((x) => x.scope === 'role' && x.scope_value === role && x.page_key === pageKey);
    return r ? r.allowed : null;
  };

  const setValue = async (role, pageKey, allowed) => {
    const cellKey = `${role}:${pageKey}`;
    setSaving(cellKey);
    try {
      if (allowed === null) {
        await clearPagePermission({ orgId, scope: 'role', scopeValue: role, pageKey });
      } else {
        await setPagePermission({ orgId, scope: 'role', scopeValue: role, pageKey, allowed, updatedBy: profile?.id });
      }
      await loadData();
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setSaving(null);
    }
  };

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.lockedBox}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <Text style={styles.lockedText}>هذه الصفحة لمالك المنصة فقط</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const pageKeys = Object.keys(PAGE_REGISTRY).filter((k) => k !== 'dashboard');

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader icon="🔐" title="إدارة الصلاحيات" subtitle={<Text style={styles.headerSubtitle}>من يرى كل صفحة</Text>} />

        <View style={styles.legend}>
          <Text style={styles.legendText}>
            <Text style={{ color: colors.green, fontWeight: 'bold' }}>✓ مسموح</Text>
            {'  ·  '}
            <Text style={{ color: colors.red, fontWeight: 'bold' }}>✕ ممنوع</Text>
            {'  ·  '}
            <Text style={{ color: colors.muted, fontWeight: 'bold' }}>↺ افتراضي النظام</Text>
          </Text>
        </View>

        {/* رأس توضيحي للأدوار (فوق كل البطاقات، مرة وحدة) */}
        <View style={styles.rolesLegendRow}>
          {ROLES.map((r) => (
            <Text key={r.key} style={styles.roleColHeader}>{r.label}</Text>
          ))}
        </View>

        {pageKeys.map((pageKey) => (
          <View key={pageKey} style={styles.pageCard}>
            <Text style={styles.pageName} numberOfLines={2}>
              {PAGE_REGISTRY[pageKey]?.label || pageKey}
            </Text>
            <View style={styles.rolesCells}>
              {ROLES.map((role) => (
                <PermissionCell
                  key={role.key}
                  roleLabel={`${role.label} — ${PAGE_REGISTRY[pageKey]?.label || pageKey}`}
                  value={getValue(role.key, pageKey)}
                  busy={saving === `${role.key}:${pageKey}`}
                  onSet={(v) => setValue(role.key, pageKey, v)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },

  lockedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lockedIcon: { fontSize: 48, marginBottom: 12 },
  lockedText: { color: colors.white, fontWeight: 'bold' },

  legend: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, marginBottom: 12 },
  legendText: { color: colors.muted, fontSize: 11, textAlign: 'right' },

  rolesLegendRow: { flexDirection: 'row-reverse', justifyContent: 'flex-end', gap: 6, paddingVertical: 6, marginBottom: 4 },
  roleColHeader: { width: 88, color: colors.muted, fontSize: 9, fontWeight: 'bold', textAlign: 'center' },

  pageCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: 12, marginBottom: 8,
  },
  pageName: { color: colors.white, fontSize: 13, fontWeight: 'bold', textAlign: 'right', marginBottom: 8 },
  rolesCells: { flexDirection: 'row-reverse', justifyContent: 'flex-end', gap: 6 },

  cellBtn: { width: 88, height: 38, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cellIcon: { fontSize: 16, fontWeight: '900' },

  sheetOption: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetOptionIcon: { fontSize: 16, fontWeight: '900', width: 20, textAlign: 'center' },
  sheetOptionText: { color: colors.white, fontSize: 14, fontWeight: 'bold', flex: 1, textAlign: 'right' },
  sheetOptionCheck: { color: colors.accent, fontSize: 10 },
});
