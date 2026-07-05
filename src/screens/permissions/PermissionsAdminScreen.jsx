import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { PAGE_REGISTRY } from '../../lib/permissions';
import { fetchAllPagePermissions, setPagePermission, clearPagePermission } from '../../lib/supabase';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import colors from '../../theme/colors';

const ROLES = [
  { key: 'super_admin', label: 'مدير الإيواء' },
  { key: 'camp_delegate', label: 'المندوب' },
  { key: 'assistant', label: 'المساعد' },
];

const STATE_STYLE = {
  true: { icon: '✓', color: colors.green, bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)' },
  false: { icon: '✕', color: colors.red, bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)' },
  default: { icon: '↺', color: colors.muted, bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)' },
};

// نفس فكرة القائمة المنبثقة بالأصل — هنا 3 أزرار مباشرة (أنسب للمس على الموبايل)
const PermissionCell = ({ value, busy, onSet }) => {
  const current = value === true ? 'true' : value === false ? 'false' : 'default';
  return (
    <View style={styles.cellRow}>
      {['true', 'false', 'default'].map((key) => {
        const s = STATE_STYLE[key];
        const selected = current === key;
        return (
          <Pressable
            key={key}
            disabled={busy}
            onPress={() => onSet(key === 'true' ? true : key === 'false' ? false : null)}
            style={[
              styles.cellBtn,
              { backgroundColor: selected ? s.bg : 'transparent', borderColor: selected ? s.border : colors.border },
            ]}
          >
            <Text style={[styles.cellIcon, { color: selected ? s.color : colors.muted }]}>{s.icon}</Text>
          </Pressable>
        );
      })}
    </View>
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

        {/* رأس الأعمدة (الأدوار) */}
        <View style={styles.headerRow}>
          <Text style={styles.pageColHeader}>الصفحة</Text>
          {ROLES.map((r) => (
            <Text key={r.key} style={styles.roleColHeader}>{r.label}</Text>
          ))}
        </View>

        {pageKeys.map((pageKey, idx) => (
          <View key={pageKey} style={[styles.pageRow, idx % 2 === 0 && styles.pageRowAlt]}>
            <Text style={styles.pageName} numberOfLines={1}>{PAGE_REGISTRY[pageKey].label}</Text>
            <View style={styles.rolesCells}>
              {ROLES.map((role) => (
                <PermissionCell
                  key={role.key}
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

  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 4 },
  pageColHeader: { flex: 1, color: colors.muted, fontSize: 10, fontWeight: 'bold', textAlign: 'right' },
  roleColHeader: { width: 96, color: colors.muted, fontSize: 9, fontWeight: 'bold', textAlign: 'center' },

  pageRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  pageRowAlt: { backgroundColor: colors.surface },
  pageName: { flex: 1, color: colors.white, fontSize: 11, fontWeight: 'bold', textAlign: 'right', paddingEnd: 6 },
  rolesCells: { flexDirection: 'row-reverse' },

  cellRow: { width: 96, flexDirection: 'row', justifyContent: 'center', gap: 3 },
  cellBtn: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cellIcon: { fontSize: 12, fontWeight: 'bold' },
});
