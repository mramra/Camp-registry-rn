import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { calcAge, naturalCompare } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import ExportButton from '../../components/ui/ExportButton';
import colors from '../../theme/colors';

const AGE_GROUPS = [
  { key: '0-2', min: 0, max: 2 },
  { key: '3-6', min: 3, max: 6 },
  { key: '7-12', min: 7, max: 12 },
  { key: '13-17', min: 13, max: 17 },
];

export default function ChildrenScreen() {
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [infantsOnly, setInfantsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const cached = await getCachedData('children_registry', profile?.id);
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
      cacheData('children_registry', profile?.id, { families: fams, members: mems, camps: visibleCamps });
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

  const childrenData = useMemo(() => {
    return members
      .map((m) => {
        const age = calcAge(m.dob);
        const f = famMap[m.family_id] || {};
        return { ...m, age, famName: f.head_name || '—', camp: campMap[f.camp_id] || '—', camp_id: f.camp_id || '', tent: f.tent || '—' };
      })
      .filter((k) => k.age !== null && k.age < 18)
      .filter((k) => !filterCamp || k.camp_id === filterCamp)
      .filter((k) => {
        if (!ageFilter) return true;
        const g = AGE_GROUPS.find((g) => g.key === ageFilter);
        return k.age >= g.min && k.age <= g.max;
      })
      .filter((k) => !ageMin || k.age >= Number(ageMin))
      .filter((k) => !ageMax || k.age <= Number(ageMax))
      .filter((k) => !orphansOnly || !!k.orphan_status)
      .filter((k) => !infantsOnly || k.age < 2)
      .filter((k) => !search.trim() || (k.name || '').includes(search) || (k.famName || '').includes(search))
      .sort((a, b) => naturalCompare(a.tent, b.tent));
  }, [members, famMap, campMap, filterCamp, ageFilter, ageMin, ageMax, orphansOnly, infantsOnly, search]);

  const orphansCount = useMemo(() => {
    return members
      .filter((m) => {
        const age = calcAge(m.dob);
        const f = famMap[m.family_id] || {};
        return age !== null && age < 18 && !!m.orphan_status && (!filterCamp || f.camp_id === filterCamp);
      }).length;
  }, [members, famMap, filterCamp]);

  const infantsCount = useMemo(() => {
    return members
      .filter((m) => {
        const age = calcAge(m.dob);
        const f = famMap[m.family_id] || {};
        return age !== null && age < 2 && (!filterCamp || f.camp_id === filterCamp);
      }).length;
  }, [members, famMap, filterCamp]);

  const ageGroupCounts = useMemo(() => {
    const all = members.map((m) => calcAge(m.dob)).filter((a) => a !== null && a < 18);
    return AGE_GROUPS.map((g) => ({ ...g, count: all.filter((a) => a >= g.min && a <= g.max).length }));
  }, [members]);

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

  const renderChild = ({ item: k }) => (
    <View style={styles.card}>
      <Text style={styles.cardName}>{k.name} <Text style={styles.ageTag}>({k.age})</Text></Text>
      <Text style={styles.cardMeta}>{k.relation} {k.gender ? `• ${k.gender}` : ''} {k.orphan_status ? '• 🔸يتيم' : ''}</Text>
      <Text style={styles.cardSubMeta}>⛺{k.tent} 🏕️{k.camp} 👨‍👩‍👧{k.famName}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={childrenData}
        keyExtractor={(item) => item.id}
        renderItem={renderChild}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="🧒"
              title="سجل الأطفال"
              action={
                <ExportButton
                  getRows={() =>
                    childrenData.map((k, i) => ({
                      '#': i + 1,
                      'الخيمة': k.tent,
                      'الاسم': k.name,
                      'رقم الهوية': k.national_id || '',
                      'العمر': k.age,
                      'الصلة': k.relation || '',
                      'الجنس': k.gender || '',
                      'يتيم؟': k.orphan_status ? 'نعم' : 'لا',
                      'رب الأسرة': k.famName,
                      'المخيم': k.camp,
                    }))
                  }
                  sheetName="الأطفال"
                  fileName="سجل_الأطفال"
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

            <View style={styles.ageGrid}>
              <Pressable
                style={[styles.ageBox, orphansOnly && styles.ageBoxActive]}
                onPress={() => setOrphansOnly((v) => !v)}
              >
                <Text style={styles.ageIcon}>🔸</Text>
                <Text style={[styles.ageCount, orphansOnly && styles.ageCountActive]}>{orphansCount}</Text>
                <Text style={styles.ageLabel}>أيتام</Text>
              </Pressable>
              <Pressable
                style={[styles.ageBox, infantsOnly && styles.ageBoxActive]}
                onPress={() => setInfantsOnly((v) => !v)}
              >
                <Text style={styles.ageIcon}>🍼</Text>
                <Text style={[styles.ageCount, infantsOnly && styles.ageCountActive]}>{infantsCount}</Text>
                <Text style={styles.ageLabel}>رضع</Text>
              </Pressable>
              {ageGroupCounts.map((g) => (
                <Pressable
                  key={g.key}
                  style={[styles.ageBox, ageFilter === g.key && styles.ageBoxActive]}
                  onPress={() => setAgeFilter(ageFilter === g.key ? '' : g.key)}
                >
                  <Text style={styles.ageIcon}>🎂</Text>
                  <Text style={[styles.ageCount, ageFilter === g.key && styles.ageCountActive]}>{g.count}</Text>
                  <Text style={styles.ageLabel}>{g.key}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.ageRow}>
              <Text style={styles.ageRowLabel}>أو عمر مخصّص:</Text>
              <TextInput
                value={ageMin}
                onChangeText={setAgeMin}
                placeholder="من"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.ageInput}
              />
              <Text style={styles.ageDash}>—</Text>
              <TextInput
                value={ageMax}
                onChangeText={setAgeMax}
                placeholder="إلى"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.ageInput}
              />
              {(!!ageMin || !!ageMax) && (
                <Pressable onPress={() => { setAgeMin(''); setAgeMax(''); }} style={styles.ageClear}>
                  <Text style={styles.ageClearText}>✕ مسح</Text>
                </Pressable>
              )}
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <Text style={styles.countText}>
              {filterCamp ? `مجموع الأطفال (أقل من 18) بـ${campMap[filterCamp]}: ` : 'مجموع الأطفال (أقل من 18): '}
              <Text style={styles.countValue}>{childrenData.length}</Text>
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="🧒" title="لا توجد نتائج" />}
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

    ageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    ageBox: {
      flexGrow: 1, minWidth: '22%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingVertical: 10, alignItems: 'center',
    },
    ageBoxActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
    ageIcon: { fontSize: 18, marginBottom: 2 },
    ageCount: { color: colors.white, fontWeight: '900', fontSize: 14 },
    ageCountActive: { color: colors.accent },
    ageLabel: { color: colors.muted, fontSize: 9, marginTop: 1 },
    ageRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
    ageRowLabel: { color: colors.muted, fontSize: 12 },
    ageInput: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 8, color: colors.white, fontSize: 13, textAlign: 'center', width: 64,
    },
    ageDash: { color: colors.muted },
    ageClear: { paddingHorizontal: 8, paddingVertical: 6 },
    ageClearText: { color: colors.red, fontSize: 11 },

    searchInput: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 8,
    },
    countText: { color: colors.muted, fontSize: 11, marginBottom: 10, textAlign: 'right' },
    countValue: { color: colors.accent, fontWeight: '900', fontSize: 13 },

    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8 },
    cardName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
    ageTag: { color: colors.accent, fontWeight: '900' },
    cardMeta: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
    cardSubMeta: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },

    campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
  });
