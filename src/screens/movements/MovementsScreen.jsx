import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchMovements, fetchCamps } from '../../lib/supabase';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDate, formatDateTime } from '../../lib/utils';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import colors from '../../theme/colors';
import MovementFormSheet from './MovementFormSheet';

const TYPE_MAP = {
  entry: { label: '🟢 دخول', color: colors.green },
  exit: { label: '🔴 خروج', color: colors.red },
  transfer: { label: '🔵 نقل', color: colors.blue },
};

export default function MovementsScreen() {
  const { profile, orgId, canWrite } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [movements, setMovements] = useState([]);
  const [camps, setCamps] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [rawMovements, setRawMovements] = useState([]); // غير مفلترة -- نفلتر محلياً بالذاكرة أو بالكاش

  const applyFilters = useCallback((movs, campsData) => {
    let result = movs;
    if (filterType) result = result.filter((m) => m.type === filterType);
    if (filterCamp) result = result.filter((m) => m.from_camp === filterCamp || m.to_camp === filterCamp);
    if (!filterCamp) {
      const allowedCampIds = getAllowedCampIds(campsData);
      if (allowedCampIds !== null) {
        const set = new Set(allowedCampIds);
        result = result.filter((m) => set.has(m.from_camp) || set.has(m.to_camp));
      }
    }
    return result;
  }, [filterType, filterCamp, getAllowedCampIds]);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const cached = await getCachedData('movements_list', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      const visible = getVisibleCamps(cached.data.camps || []);
      setCamps(visible);
      setRawMovements(cached.data.movements || []);
      setMovements(applyFilters(cached.data.movements || [], cached.data.camps || []));
      setOfflineInfo({ savedAt: cached.savedAt });
      setLoading(false);
    }

    try {
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) {
        if (!hadCache) showError('لا يوجد اتصال ولا توجد بيانات محفوظة');
        return;
      }

      const [campsData, movs] = await withTimeout(
        Promise.all([fetchCamps(orgId), fetchMovements(orgId, {})]),
        12000,
        'انتهت مهلة تحميل البيانات'
      );
      const visible = getVisibleCamps(campsData);
      setCamps(visible);
      setRawMovements(movs);
      setMovements(applyFilters(movs, campsData));
      setOfflineInfo(null);
      cacheData('movements_list', profile?.id, { movements: movs, camps: campsData });
    } catch (e) {
      if (!hadCache) showError('تعذّر تحميل حركات الأسر');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getVisibleCamps, applyFilters]);

  // إعادة تطبيق الفلاتر محلياً فوراً (بدون طلب شبكة) كل ما تتغيّر
  useEffect(() => {
    if (rawMovements.length) setMovements(applyFilters(rawMovements, camps));
  }, [filterType, filterCamp]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => {
    const map = {};
    camps.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [camps]);

  const stats = useMemo(() => {
    const s = { entry: 0, exit: 0, transfer: 0 };
    movements.forEach((m) => { if (s[m.type] !== undefined) s[m.type]++; });
    return s;
  }, [movements]);

  const renderMovement = ({ item: m }) => {
    const t = TYPE_MAP[m.type] || { label: m.type, color: colors.muted };
    return (
      <View style={[styles.card, { borderRightColor: t.color }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.familyName}>{m.families?.head_name || '—'}</Text>
            {!!m.families?.head_id && <Text style={styles.familyId}>{m.families.head_id}</Text>}
            <View style={styles.metaRow}>
              {!!m.from_camp && <Text style={styles.metaText}>📤 {campMap[m.from_camp] || '—'}</Text>}
              {!!m.to_camp && <Text style={styles.metaText}>📥 {campMap[m.to_camp] || '—'}</Text>}
              {!!m.reason && <Text style={styles.metaText}>• {m.reason}</Text>}
            </View>
            {!!m.notes && <Text style={styles.notes}>{m.notes}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={[styles.typeBadge, { color: t.color, backgroundColor: `${t.color}22` }]}>{t.label}</Text>
            <Text style={styles.dateText}>{formatDate(m.date)}</Text>
          </View>
        </View>
      </View>
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
        data={movements}
        keyExtractor={(item) => item.id}
        renderItem={renderMovement}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="🚶"
              title="حركات الأسر"
              subtitle={<Text style={styles.headerSubtitle}>{movements.length} حركة</Text>}
              action={
                canWrite && !offlineInfo && (
                  <Pressable style={styles.addBtn} onPress={() => setFormVisible(true)}>
                    <Text style={styles.addBtnText}>➕ نقل أسرة</Text>
                  </Pressable>
                )
              }
            />
            {!!offlineInfo && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة (لا يمكن تسجيل نقل الآن)
                </Text>
              </View>
            )}

            <View style={styles.statsRow}>
              {Object.entries(TYPE_MAP).map(([k, v]) => (
                <View key={k} style={styles.statCard}>
                  <Text style={[styles.statValue, { color: v.color }]}>{stats[k] || 0}</Text>
                  <Text style={styles.statLabel}>{v.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.chipsRow}>
              <FilterChip label="كل الأنواع" selected={!filterType} onPress={() => setFilterType('')} />
              {Object.entries(TYPE_MAP).map(([k, v]) => (
                <FilterChip key={k} label={v.label} selected={filterType === k} onPress={() => setFilterType(k)} />
              ))}
            </View>
            <View style={styles.chipsRow}>
              <FilterChip
                label={filterCamp ? campMap[filterCamp] : 'كل المخيمات'}
                selected={!!filterCamp}
                onPress={() => setCampPickerVisible(true)}
              />
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="🚶" title="لا توجد حركات" />}
      />

      <BottomSheetModal visible={campPickerVisible} onClose={() => setCampPickerVisible(false)} title="اختر المخيم">
        <Pressable style={styles.campOption} onPress={() => { setFilterCamp(''); setCampPickerVisible(false); }}>
          <Text style={styles.campOptionText}>كل المخيمات</Text>
        </Pressable>
        {camps.map((c) => (
          <Pressable key={c.id} style={styles.campOption} onPress={() => { setFilterCamp(c.id); setCampPickerVisible(false); }}>
            <Text style={styles.campOptionText}>{c.name}</Text>
          </Pressable>
        ))}
      </BottomSheetModal>

      <MovementFormSheet
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSaved={() => { setFormVisible(false); loadData(); }}
        camps={camps}
        orgId={orgId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  addBtn: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  addBtnText: { color: '#000', fontWeight: '900', fontSize: 12 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRightWidth: 4, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  familyName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  familyId: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  metaText: { color: colors.muted, fontSize: 10 },
  notes: { color: colors.muted, fontSize: 10, marginTop: 6, textAlign: 'right' },
  typeBadge: { fontSize: 10, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  dateText: { color: colors.muted, fontSize: 10 },

  campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
});
