import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps, fetchOrgMembers } from '../../lib/supabase';
import { calcAge, naturalCompare, normalizeHealthValue, buildCampExportBanner } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import ExportButton from '../../components/ui/ExportButton';
import colors from '../../theme/colors';

export default function MenScreen() {
  const navigation = useNavigation();
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [menType, setMenType] = useState('');
  const [specialFilter, setSpecialFilter] = useState(''); // '' | widower | divorced | head | elderly
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const cached = await getCachedData('men_registry', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      setFamilies(cached.data.families || []);
      setMembers(cached.data.members || []);
      setCamps(cached.data.camps || []);
      setOrgMembers(cached.data.orgMembers || []);
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
      const members2 = await withTimeout(fetchOrgMembers(orgId), 12000, 'انتهت مهلة تحميل البيانات');
      const visibleCamps = getVisibleCamps(campsData);

      setCamps(visibleCamps);
      setFamilies(fams);
      setMembers(mems);
      setOrgMembers(members2);
      setOfflineInfo(null);
      cacheData('men_registry', profile?.id, { families: fams, members: mems, camps: visibleCamps, orgMembers: members2 });
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

  const allMen = useMemo(() => {
    const heads = families
      .filter((f) => f.head_gender === 'ذكر')
      .map((f) => ({
        id: 'f-' + f.id,
        famId: f.id,
        name: f.head_name,
        age: calcAge(f.head_dob),
        type: 'رأس الأسرة',
        marital: f.head_marital || '—',
        chronic: normalizeHealthValue(f.head_chronic_diseases),
        camp: campMap[f.camp_id] || '—',
        camp_id: f.camp_id || '',
        tent: f.tent || '—',
      }));
    const relMembers = members
      .filter((m) => m.gender === 'ذكر' || ['زوج', 'أب', 'ابن', 'أخ'].includes(m.relation || ''))
      .map((m) => {
        const f = famMap[m.family_id] || {};
        return {
          id: 'm-' + m.id,
          famId: m.family_id,
          name: m.name || '—',
          age: calcAge(m.dob),
          type: m.relation || 'ذكر',
          marital: '—',
          chronic: normalizeHealthValue(m.chronic_diseases),
          camp: campMap[f.camp_id] || '—',
          camp_id: f.camp_id || '',
          tent: f.tent || '—',
        };
      });
    return [...heads, ...relMembers];
  }, [families, members, famMap, campMap]);

  // أعداد الفئات الخاصة بمخيم فقط (بلا تأثير الفلاتر التانية) عشان تظهر ثابتة بجانب كل زر
  const campMen = useMemo(
    () => (filterCamp ? allMen.filter((w) => w.camp_id === filterCamp) : allMen),
    [allMen, filterCamp]
  );
  const specialCounts = useMemo(
    () => ({
      widower: campMen.filter((w) => w.marital === 'أرمل' || w.marital === 'أرملة').length,
      divorced: campMen.filter((w) => w.marital === 'مطلق' || w.marital === 'مطلقة').length,
      head: campMen.filter((w) => w.type === 'رأس الأسرة').length,
      elderly: campMen.filter((w) => w.age !== null && w.age >= 60).length,
    }),
    [campMen]
  );

  const menData = useMemo(() => {
    return allMen
      .filter((w) => !filterCamp || w.camp_id === filterCamp)
      .filter((w) => !menType || w.type === menType)
      .filter((w) => {
        if (!specialFilter) return true;
        if (specialFilter === 'widower') return w.marital === 'أرمل' || w.marital === 'أرملة';
        if (specialFilter === 'divorced') return w.marital === 'مطلق' || w.marital === 'مطلقة';
        if (specialFilter === 'head') return w.type === 'رأس الأسرة';
        if (specialFilter === 'elderly') return w.age !== null && w.age >= 60;
        return true;
      })
      .filter((w) => !ageMin || (w.age !== null && w.age >= Number(ageMin)))
      .filter((w) => !ageMax || (w.age !== null && w.age <= Number(ageMax)))
      .filter((w) => !search.trim() || (w.name || '').includes(search))
      .sort((a, b) => naturalCompare(a.tent, b.tent));
  }, [allMen, filterCamp, menType, specialFilter, ageMin, ageMax, search]);

  const RELATION_ICONS = { 'رأس الأسرة': '🏠', 'زوج': '🤵', 'أب': '👴', 'ابن': '👦', 'أخ': '👬', 'ذكر': '👨' };
  const relationTypes = useMemo(() => {
    const counts = {};
    campMen.forEach((w) => { counts[w.type] = (counts[w.type] || 0) + 1; });
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }, [campMen]);
  const menStats = useMemo(
    () => ({ total: menData.length }),
    [menData]
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

  const renderMan = ({ item: w }) => (
    <Pressable style={styles.card} onPress={() => w.famId && navigation.push('FamilyDetail', { familyId: w.famId })}>
      <Text style={styles.cardName}>{w.name} <Text style={styles.typeTag}>({w.type})</Text></Text>
      <Text style={styles.cardMeta}>{w.age ?? '—'} سنة • {w.marital}</Text>
      {!!w.chronic && <Text style={styles.chronicText}>🩺 {w.chronic}</Text>}
      <Text style={styles.cardSubMeta}>⛺{w.tent} 🏕️{w.camp} — اضغط للانتقال للأسرة ←</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={menData}
        keyExtractor={(item) => item.id}
        renderItem={renderMan}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="👨"
              title="الرجال"
              action={
                <ExportButton
                  getRows={() =>
                    menData.map((w, i) => ({
                      '#': i + 1,
                      'الخيمة': w.tent,
                      'الاسم': w.name,
                      'العمر': w.age ?? '',
                      'الصلة': w.type,
                      'الحالة الاجتماعية': w.marital,
                      'أمراض مزمنة': w.chronic,
                      'المخيم': w.camp,
                    }))
                  }
                  sheetName="الرجال"
                  fileName="سجل_الرجال"
                  getBanner={() => {
                    if (!filterCamp) return null;
                    const camp = camps.find((c) => c.id === filterCamp);
                    return buildCampExportBanner(camp, orgMembers);
                  }}
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

            <View style={styles.categoryGrid}>
              {[
                { key: 'widower', icon: '🖤', label: 'أرامل', count: specialCounts.widower },
                { key: 'divorced', icon: '💔', label: 'مطلقين', count: specialCounts.divorced },
                { key: 'head', icon: '🏠', label: 'معيل أسرة', count: specialCounts.head },
                { key: 'elderly', icon: '👴', label: 'كبار السن (60+)', count: specialCounts.elderly },
              ].map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setSpecialFilter((f) => (f === c.key ? '' : c.key))}
                  style={[styles.categoryCell, specialFilter === c.key && styles.categoryCellActive]}
                >
                  <Text style={styles.categoryIcon}>{c.icon}</Text>
                  <Text style={[styles.categoryCount, specialFilter === c.key && styles.categoryCountActive]}>{c.count}</Text>
                  <Text style={styles.categoryLabel}>{c.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.categoryGrid}>
              <View style={styles.categoryCell}>
                <Text style={styles.categoryIcon}>👨‍👨‍👦</Text>
                <Text style={styles.categoryCount}>{menStats.total}</Text>
                <Text style={styles.categoryLabel}>{filterCamp ? `الإجمالي بـ${campMap[filterCamp]}` : 'الإجمالي'}</Text>
              </View>
            </View>

            <View style={styles.categoryGrid}>
              <Pressable
                onPress={() => setMenType('')}
                style={[styles.categoryCell, !menType && styles.categoryCellActive]}
              >
                <Text style={styles.categoryIcon}>👥</Text>
                <Text style={[styles.categoryCount, !menType && styles.categoryCountActive]}>{campMen.length}</Text>
                <Text style={styles.categoryLabel}>كل الصلات</Text>
              </Pressable>
              {relationTypes.map(({ type, count }) => (
                <Pressable
                  key={type}
                  onPress={() => setMenType(type)}
                  style={[styles.categoryCell, menType === type && styles.categoryCellActive]}
                >
                  <Text style={styles.categoryIcon}>{RELATION_ICONS[type] || '👨'}</Text>
                  <Text style={[styles.categoryCount, menType === type && styles.categoryCountActive]}>{count}</Text>
                  <Text style={styles.categoryLabel}>{type}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.ageRow}>
              <Text style={styles.ageLabel}>الفئة العمرية:</Text>
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

            <Text style={styles.countText}>{menData.length} رجل</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="👨" title="لا توجد نتائج" />}
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
    ageRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
    ageLabel: { color: colors.muted, fontSize: 12, marginStart: 4 },
    ageInput: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 8, color: colors.white, fontSize: 13, textAlign: 'center', width: 64,
    },
    ageDash: { color: colors.muted },
    ageClear: { paddingHorizontal: 8, paddingVertical: 6 },
    ageClearText: { color: colors.red, fontSize: 11 },

    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    categoryCell: {
      flexGrow: 1, minWidth: '22%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingVertical: 10, alignItems: 'center',
    },
    categoryCellActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
    categoryIcon: { fontSize: 18, marginBottom: 2 },
    categoryCount: { color: colors.white, fontWeight: '900', fontSize: 14 },
    categoryCountActive: { color: colors.accent },
    categoryLabel: { color: colors.muted, fontSize: 9, marginTop: 1, textAlign: 'center' },

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
