import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { fetchAuditLogs } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import colors from '../../theme/colors';

// تسميات وأيقونات عربية لكل نوع إجراء -- action مخزَّنة كـ'entityType_action'
// (مثال: user_update) للإجراءات العامة، أو أسماء الأجهزة القديمة
// (device_approved) للتوافق مع 939 سجل تاريخي موجود قبل هذا التوسيع
const ACTION_META = {
  user_update: { icon: '👤', label: 'تعديل مستخدم', color: colors.blue },
  camp_delete: { icon: '🗑️', label: 'حذف مخيم', color: colors.red },
  camp_update: { icon: '🏕️', label: 'تعديل مخيم', color: colors.blue },
  device_approved: { icon: '✅', label: 'اعتماد جهاز', color: colors.green },
  device_blocked: { icon: '🚫', label: 'حظر جهاز', color: colors.red },
  device_unblocked: { icon: '🔓', label: 'إلغاء حظر جهاز', color: colors.accent },
  device_removed: { icon: '🗑️', label: 'إزالة جهاز', color: colors.red },
};

const FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'user', label: '👤 مستخدمين' },
  { key: 'camp', label: '🏕️ مخيمات' },
  { key: 'device', label: '📱 أجهزة' },
];

export default function AuditLogScreen() {
  const { orgId } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('');

  const loadData = useCallback(async () => {
    if (!orgId) return;
    const data = await fetchAuditLogs(orgId, 300);
    setLogs(data);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useFocusEffect(useCallback(() => { setLoading(true); loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const filtered = filter ? logs.filter((l) => l.action?.startsWith(filter)) : logs;

  const renderItem = ({ item: l }) => {
    const meta = ACTION_META[l.action] || { icon: '📝', label: l.action, color: colors.muted };
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.icon}>{meta.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionText, { color: meta.color }]}>{meta.label}</Text>
            {!!l.target_name && <Text style={styles.targetText}>🎯 {l.target_name}</Text>}
          </View>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>👤 {l.user_name || '—'}</Text>
          <Text style={styles.metaText}>{formatDateTime(l.created_at)}</Text>
        </View>
        {!!l.details && Object.keys(l.details).length > 0 && (
          <Text style={styles.detailsText} numberOfLines={2}>
            {Object.entries(l.details).map(([k, v]) => `${k}: ${v}`).join(' • ')}
          </Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(l) => l.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="📋"
              title="سجل التدقيق الشامل"
              subtitle={<Text style={styles.headerSubtitle}>{filtered.length} إجراء</Text>}
            />
            <Text style={styles.hint}>
              سجل كل الإجراءات الإدارية الحساسة (تعديل مستخدمين، حذف مخيمات، اعتماد/حظر أجهزة) بمكان واحد.
            </Text>
            <View style={styles.chipsRow}>
              {FILTERS.map((f) => (
                <FilterChip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} /> : <EmptyState icon="📋" title="لا يوجد سجل بعد" />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'right', marginBottom: 12 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  icon: { fontSize: 18 },
  actionText: { fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  targetText: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
  metaRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  metaText: { color: colors.muted, fontSize: 10 },
  detailsText: { color: colors.muted, fontSize: 10, marginTop: 6, textAlign: 'right' },
});
