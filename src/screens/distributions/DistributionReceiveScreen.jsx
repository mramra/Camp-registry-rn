import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import {
  fetchFamilies,
  fetchFamilyMembers,
  fetchDistReceivedFamilyIds,
  markFamilyReceived,
  unmarkFamilyReceived,
} from '../../lib/supabase';
import { getFamilyPriority, TIER_LABELS } from '../../lib/helpers';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import colors from '../../theme/colors';

const TIER_COLOR = { urgent: colors.red, need: colors.accent, ok: colors.green };

export default function DistributionReceiveScreen() {
  const route = useRoute();
  const { batch, round } = route.params || {};
  const { orgId, canWrite } = useAuth();
  const { getAllowedCampIds, filterLocal } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [membersByFamily, setMembersByFamily] = useState({});
  const [receivedIds, setReceivedIds] = useState(new Set());
  const [tab, setTab] = useState('pending'); // pending | received
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!batch?.id || !orgId) return;
    try {
      const campId = batch.camp_id || round?.camp_id;
      const allowedCampIds = getAllowedCampIds([{ id: campId }]);

      const famsRaw = await fetchFamilies(orgId, campId || null);
      const fams = filterLocal(famsRaw, allowedCampIds);
      setFamilies(fams);

      const members = await fetchFamilyMembers(fams.map((f) => f.id));
      const grouped = {};
      members.forEach((m) => {
        if (!grouped[m.family_id]) grouped[m.family_id] = [];
        grouped[m.family_id].push(m);
      });
      setMembersByFamily(grouped);

      const received = await fetchDistReceivedFamilyIds(batch.id);
      setReceivedIds(received);
    } catch (e) {
      showError('تعذّر تحميل قائمة الأسر');
    } finally {
      setLoading(false);
    }
  }, [batch?.id, orgId]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const filtered = useMemo(() => {
    let list = families.filter((f) => (tab === 'received' ? receivedIds.has(f.id) : !receivedIds.has(f.id)));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => (f.head_name || '').toLowerCase().includes(q) || (f.head_id || '').includes(q));
    }

    // ترتيب حسب الأولوية (الأعجل أولاً) — نفس منطق الأصل
    list.sort((a, b) => {
      const order = { urgent: 0, need: 1, ok: 2 };
      const pa = getFamilyPriority(a, membersByFamily[a.id]).tier;
      const pb = getFamilyPriority(b, membersByFamily[b.id]).tier;
      return order[pa] - order[pb];
    });

    return list;
  }, [families, receivedIds, tab, search, membersByFamily]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleReceive = async (family) => {
    if (!canWrite) {
      showError('لا تملك صلاحية تسجيل الاستلام');
      return;
    }
    const already = receivedIds.has(family.id);
    try {
      if (already) {
        await unmarkFamilyReceived(batch.id, family.id);
        setReceivedIds((prev) => {
          const next = new Set(prev);
          next.delete(family.id);
          return next;
        });
        showSuccess('تم إلغاء الاستلام');
      } else {
        await markFamilyReceived(batch.id, orgId, family.id);
        setReceivedIds((prev) => new Set(prev).add(family.id));
        showSuccess('تم تسجيل الاستلام');
      }
    } catch (e) {
      showError('خطأ: ' + e.message);
    }
  };

  const bulkMarkReceived = async () => {
    if (!canWrite) {
      showError('لا تملك صلاحية تسجيل الاستلام');
      return;
    }
    if (selectedIds.size === 0) {
      showError('لم تُحدد أي أسرة');
      return;
    }
    setBulkSaving(true);
    try {
      const ids = [...selectedIds];
      for (const famId of ids) {
        await markFamilyReceived(batch.id, orgId, famId);
      }
      setReceivedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      showSuccess(`تم تسجيل استلام ${ids.length} أسرة`);
      setSelectedIds(new Set());
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const renderFamily = ({ item: f }) => {
    const priority = getFamilyPriority(f, membersByFamily[f.id]);
    const memberCount = 1 + (membersByFamily[f.id]?.length || 0);
    const selected = selectedIds.has(f.id);

    return (
      <Pressable
        style={[styles.card, { borderRightColor: TIER_COLOR[priority.tier] }, selected && styles.cardSelected]}
        onPress={() => (tab === 'pending' ? toggleSelect(f.id) : toggleReceive(f))}
        onLongPress={() => toggleReceive(f)}
      >
        <View style={styles.cardRow}>
          {tab === 'pending' && (
            <Text style={styles.checkbox}>{selected ? '☑️' : '⬜'}</Text>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.familyName}>{f.head_name || '—'}</Text>
            <Text style={styles.metaLine}>{memberCount} أفراد · {TIER_LABELS[priority.tier]}</Text>
          </View>
          {tab === 'received' && (
            <Pressable style={styles.undoBtn} onPress={() => toggleReceive(f)}>
              <Text style={styles.undoBtnText}>↺ إلغاء</Text>
            </Pressable>
          )}
        </View>
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
        renderItem={renderFamily}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="✅"
              title={batch?.name || 'تسجيل الاستلام'}
              subtitle={<Text style={styles.headerSubtitle}>{receivedIds.size} استلم من أصل {families.length}</Text>}
            />

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث بالاسم أو رقم الهوية..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <View style={styles.chipsRow}>
              <FilterChip
                label={`⏳ لم يستلم (${families.length - receivedIds.size})`}
                selected={tab === 'pending'}
                onPress={() => { setTab('pending'); setSelectedIds(new Set()); }}
              />
              <FilterChip
                label={`✅ استلم (${receivedIds.size})`}
                selected={tab === 'received'}
                onPress={() => setTab('received')}
              />
            </View>

            {tab === 'pending' && (
              <Text style={styles.hint}>اضغط لتحديد أسرة، اضغط مطولاً لتسجيل استلامها مباشرة</Text>
            )}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="✅" title={tab === 'pending' ? 'كل الأسر استلمت' : 'لا توجد أسر مستلمة بعد'} />}
      />

      {tab === 'pending' && selectedIds.size > 0 && canWrite && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkText}>{selectedIds.size} محددة</Text>
          <Pressable style={[styles.bulkBtn, bulkSaving && styles.disabled]} onPress={bulkMarkReceived} disabled={bulkSaving}>
            {bulkSaving ? <ActivityIndicator color="#000" /> : <Text style={styles.bulkBtnText}>✅ تسجيل الاستلام</Text>}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 90 },
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
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  hint: { color: colors.muted, fontSize: 10, marginBottom: 10, textAlign: 'right' },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRightWidth: 3, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardSelected: { backgroundColor: 'rgba(245,158,11,0.1)' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { fontSize: 16 },
  familyName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  metaLine: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
  undoBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  undoBtnText: { color: colors.muted, fontSize: 10, fontWeight: 'bold' },

  bulkBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
  },
  bulkText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
  bulkBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  disabled: { opacity: 0.6 },
  bulkBtnText: { color: '#000', fontWeight: '900', fontSize: 12 },
});
