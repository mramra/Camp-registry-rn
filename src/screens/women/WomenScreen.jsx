import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { calcAge, naturalCompare, normalizeHealthValue } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import ExportButton from '../../components/ui/ExportButton';
import colors from '../../theme/colors';

export default function WomenScreen() {
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [womenType, setWomenType] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const cached = await getCachedData('women_registry', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      setFamilies(cached.data.families || []);
      setMembers(cached.data.members || []);
      setCamps(cached.data.camps || []);
      setOfflineInfo({ savedAt: cached.savedAt });
      setLoading(false);
    }

    try {
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) {
        if (!hadCache) showError('لا يوجد اتصال ولا توجد بيانات محفوظة');
        return;
      }

      const campsData = await withTimeout(fetchCamps(orgId), 12000, 'انتهت مهلة تحميل البيانات');
      const allowedCampIds = getAllowedCampIds(campsData);
      const famsRaw = await withTimeout(fetchFamilies(orgId), 12000, 'انتهت مهلة تحميل البيانات');
      const fams = allowedCampIds === null ? famsRaw : famsRaw.filter((f) => allowedCampIds.includes(f.camp_id));
      const mems = await withTimeout(fetchFamilyMembers(fams.map((f) => f.id)), 12000, 'انتهت مهلة تحميل البيانات');
      const visibleCamps = getVisibleCamps(campsData);

      setCamps(visibleCamps);
      setFamilies(fams);
      setMembers(mems);
      setOfflineInfo(null);
      cacheData('women_registry', profile?.id, { families: fams, members: mems, camps: visibleCamps });
    } catch (e) {
      if (!hadCache) showError('تعذّر تحميل السجل ولا توجد نسخة محفوظة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);
  const famMap = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f])), [families]);

  const womenData = useMemo(() => {
    const heads = families
      .filter((f) => f.head_gender === 'أنثى')
      .map((f) => ({
        id: 'f-' + f.id,
        name: f.head_name,
        age: calcAge(f.head_dob),
        type: 'رأس الأسرة',
        marital: f.head_marital || '—',
        status: f.head_female_status || '',
        chronic: normalizeHealthValue(f.head_chronic_diseases),
        camp: campMap[f.camp_id] || '—',
        camp_id: f.camp_id || '',
        tent: f.tent || '—',
      }));
    const relMembers = members
      .filter((m) => m.gender === 'أنثى' || ['زوجة', 'أم', 'ابنة', 'أخت'].includes(m.relation || ''))
      .map((m) => {
        const f = famMap[m.family_id] || {};
        return {
          id: 'm-' + m.id,
          name: m.name || '—',
          age: calcAge(m.dob),
          type: m.relation || 'أنثى',
          marital: '—',
          status: '',
          chronic: normalizeHealthValue(m.chronic_diseases),
          camp: campMap[f.camp_id] || '—',
          camp_id: f.camp_id || '',
          tent: f.tent || '—',
        };
      });
    return [...heads, ...relMembers]
      .filter((w) => !filterCamp || w.camp_id === filterCamp)
      .filter((w) => !womenType || w.type === womenType)
      .filter((w) => !search.trim() || (w.name || '').includes(search))
      .sort((a, b) => naturalCompare(a.tent, b.tent));
  }, [families, members, famMap, campMap, filterCamp, womenType, search]);

  const womenTypes = useMemo(() => [...new Set(womenData.map((w) => w.type))], [womenData]);
  const womenStats = useMemo(
    () => ({
      total: womenData.length,
      heads: womenData.filter((w) => w.type === 'رأس الأسرة').length,
      pregnant: womenData.filter((w) => w.status === 'حامل').length,
    }),
    [womenData]
  );

  const styles = getStyles();

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const renderWoman = ({ item: w }) => (
    <View style={styles.card}>
      <Text style={styles.cardName}>{w.name} <Text style={styles.typeTag}>({w.type})</Text></Text>
      <Text style={styles.cardMeta}>{w.age ?? '—'} سنة • {w.marital} {w.status ? `• 🔸${w.status}` : ''}</Text>
      {!!w.chronic && <Text style={styles.chronicText}>🩺 {w.chronic}</Text>}
      <Text style={styles.cardSubMeta}>⛺{w.tent} 🏕️{w.camp}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={womenData}
        keyExtractor={(item) => item.id}
        renderItem={renderWoman}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="👩"
              title="النساء"
              action={
                <ExportButton
                  getRows={() =>
                    womenData.map((w, i) => ({
                      '#': i + 1,
                      'الخيمة': w.tent,
                      'الاسم': w.name,
                      'العمر': w.age ?? '',
                      'الصلة': w.type,
                      'الحالة الاجتماعية': w.marital,
                      'الوضع': w.status,
                      'أمراض مزمنة': w.chronic,
                      'المخيم': w.camp,
                    }))
                  }
                  sheetName="النساء"
                  fileName="سجل_النساء"
                />
              }
            />

            {!!offlineInfo && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة
                </Text>
              </View>
            )}

            <View style={styles.chipsRow}>
              <FilterChip
                label={filterCamp ? campMap[filterCamp] : 'كل المخيمات'}
                selected={!!filterCamp}
                onPress={() => setCampPickerVisible(true)}
              />
            </View>

            <View style={styles.statsGrid}>
              {[['الإجمالي', womenStats.total], ['ربات البيوت', womenStats.heads], ['حوامل', womenStats.pregnant]].map(([l, v]) => (
                <View key={l} style={styles.statBox}>
                  <Text style={styles.statValue}>{v}</Text>
                  <Text style={styles.statLabel}>{l}</Text>
                </View>
              ))}
            </View>

            <View style={styles.chipsRow}>
              <FilterChip label="كل الصلات" selected={!womenType} onPress={() => setWomenType('')} />
              {womenTypes.map((t) => (
                <FilterChip key={t} label={t} selected={womenType === t} onPress={() => setWomenType(t)} />
              ))}
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <Text style={styles.countText}>{womenData.length} امرأة</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="👩" title="لا توجد نتائج" />}
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
    </SafeAreaView>
  );
}

const getStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { padding: 16, paddingBottom: 32 },
    offlineBanner: {
      backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
      borderRadius: 12, padding: 10, marginBottom: 12,
    },
    offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },

    statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    statBox: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, alignItems: 'center' },
    statValue: { color: colors.accent, fontWeight: '900', fontSize: 16 },
    statLabel: { color: colors.muted, fontSize: 9, marginTop: 2 },

    searchInput: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 8,
    },
    countText: { color: colors.muted, fontSize: 11, marginBottom: 10, textAlign: 'right' },

    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8 },
    cardName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
    typeTag: { color: colors.muted, fontWeight: 'normal', fontSize: 11 },
    cardMeta: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
    cardSubMeta: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },
    chronicText: { color: colors.accent, fontSize: 10, marginTop: 2, textAlign: 'right' },

    campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
  });
