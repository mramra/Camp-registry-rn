import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchAuditLog, fetchCamps, fetchFamilies } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import { TRACKED_FIELDS } from '../../lib/formOptions';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import colors from '../../theme/colors';

const OP_STYLE = {
  insert: { label: '➕ إضافة', color: colors.green },
  update: { label: '✏️ تعديل', color: colors.accent },
  delete: { label: '🗑️ حذف', color: colors.red },
};

export default function AuditScreen() {
  const { orgId } = useAuth();
  const { getAllowedCampIds } = useDataScope();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [actorPickerVisible, setActorPickerVisible] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const loadLogs = useCallback(async () => {
    if (!orgId) return;
    try {
      const [camps, families, rowsRaw] = await Promise.all([
        fetchCamps(orgId),
        fetchFamilies(orgId),
        fetchAuditLog(orgId, 300),
      ]);

      const campIds = getAllowedCampIds(camps);
      let rows = rowsRaw;
      if (campIds !== null) {
        const set = new Set(campIds);
        const allowedFamilyIds = new Set(families.filter((f) => set.has(f.camp_id)).map((f) => f.id));
        rows = rows.filter((r) => r.family_id && allowedFamilyIds.has(r.family_id));
      }

      setLogs(rows.slice(0, 150));
    } catch (e) {
      showError('تعذّر تحميل سجل التغييرات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useFocusEffect(useCallback(() => { loadLogs(); }, [loadLogs]));

  const onRefresh = () => { setRefreshing(true); loadLogs(); };

  const actorOptions = useMemo(
    () => [...new Set(logs.map((l) => l.actor_name).filter(Boolean))].sort(),
    [logs]
  );

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (actorFilter && l.actor_name !== actorFilter) return false;
      if (search.trim() && !(l.family_name || '').includes(search.trim())) return false;
      return true;
    });
  }, [logs, actionFilter, actorFilter, search]);

  const renderChanges = (changes) => {
    const keys = Object.keys(changes || {});
    if (!keys.length) return null;
    return (
      <View style={styles.changesBox}>
        {keys.map((k) => (
          <View key={k} style={styles.changeRow}>
            <Text style={styles.changeField}>{TRACKED_FIELDS[k] || k}:</Text>
            <Text style={styles.changeOld}>{changes[k].old ?? '—'}</Text>
            <Text style={styles.changeArrow}>←</Text>
            <Text style={styles.changeNew}>{changes[k].new ?? '—'}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderLog = ({ item: l }) => {
    const op = OP_STYLE[l.action] || OP_STYLE.update;
    const isOpen = expanded === l.id;
    const hasChanges = l.changes && Object.keys(l.changes).length > 0;

    return (
      <Pressable style={styles.card} onPress={() => hasChanges && setExpanded(isOpen ? null : l.id)}>
        <View style={styles.cardTop}>
          <Text style={[styles.opBadge, { color: op.color, backgroundColor: `${op.color}22` }]}>{op.label}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.familyName} numberOfLines={1}>{l.family_name || '—'}</Text>
            <Text style={styles.actorName}>👤 {l.actor_name || '—'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.timeText}>{formatDateTime(l.created_at)}</Text>
            {hasChanges && (
              <Text style={styles.changeCount}>{isOpen ? '▲' : `▼ ${Object.keys(l.changes).length} تغيير`}</Text>
            )}
          </View>
        </View>
        {isOpen && renderChanges(l.changes)}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderLog}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader icon="📝" title="سجل التغييرات" subtitle={<Text style={styles.headerSubtitle}>آخر 150 عملية حقيقية</Text>} />

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث باسم رب الأسرة..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <View style={styles.chipsRow}>
              <FilterChip label="كل الإجراءات" selected={!actionFilter} onPress={() => setActionFilter('')} />
              {Object.entries(OP_STYLE).map(([key, v]) => (
                <FilterChip key={key} label={v.label} selected={actionFilter === key} onPress={() => setActionFilter(key)} />
              ))}
            </View>

            <View style={styles.chipsRow}>
              <FilterChip
                label={actorFilter || 'كل المستخدمين'}
                selected={!!actorFilter}
                onPress={() => setActorPickerVisible(true)}
              />
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="📝" title="لا توجد سجلات" />}
      />

      <BottomSheetModal visible={actorPickerVisible} onClose={() => setActorPickerVisible(false)} title="اختر المستخدم">
        <Pressable style={styles.actorOption} onPress={() => { setActorFilter(''); setActorPickerVisible(false); }}>
          <Text style={styles.actorOptionText}>كل المستخدمين</Text>
        </Pressable>
        {actorOptions.map((name) => (
          <Pressable key={name} style={styles.actorOption} onPress={() => { setActorFilter(name); setActorPickerVisible(false); }}>
            <Text style={styles.actorOptionText}>{name}</Text>
          </Pressable>
        ))}
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  searchInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 10,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 6 },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  opBadge: { fontSize: 10, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  familyName: { color: colors.white, fontWeight: 'bold', fontSize: 12, textAlign: 'right' },
  actorName: { color: colors.muted, fontSize: 10, textAlign: 'right', marginTop: 2 },
  timeText: { color: colors.muted, fontSize: 10 },
  changeCount: { color: colors.accent, fontSize: 10, marginTop: 2 },

  changesBox: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
  changeRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4 },
  changeField: { color: colors.white, fontWeight: 'bold', fontSize: 11 },
  changeOld: { color: colors.muted, fontSize: 11, textDecorationLine: 'line-through' },
  changeArrow: { color: colors.muted, fontSize: 11 },
  changeNew: { color: colors.accent, fontSize: 11 },

  actorOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  actorOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
});
