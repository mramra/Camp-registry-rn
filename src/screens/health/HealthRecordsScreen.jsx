import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { naturalCompare, normalizeHealthValue } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import Badge from '../../components/ui/Badge';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import ExportButton from '../../components/ui/ExportButton';
import colors from '../../theme/colors';

const HEALTH_TYPES = [
  { key: 'all', label: 'الكل', icon: '🏥' },
  { key: 'chronic', label: 'أمراض مزمنة', icon: '💊' },
  { key: 'disability', label: 'إعاقات', icon: '♿' },
  { key: 'injury', label: 'إصابات', icon: '🩹' },
  { key: 'needs', label: 'احتياجات صحية', icon: '🦽' },
];

const FIELD_MAP = {
  chronic: { fField: 'head_chronic_diseases', mField: 'chronic_diseases', label: 'أمراض مزمنة' },
  disability: { fField: 'head_disabilities', mField: 'disabilities', label: 'إعاقة' },
  injury: { fField: 'head_injuries', mField: 'injuries', label: 'إصابة' },
  needs: { fField: 'head_needs', mField: 'needs', label: 'احتياج صحي' },
};

export default function HealthRecordsScreen() {
  const navigation = useNavigation();
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [healthType, setHealthType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const cached = await getCachedData('health_registry', profile?.id);
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
      cacheData('health_registry', profile?.id, { families: fams, members: mems, camps: visibleCamps });
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

  const allRecords = useMemo(() => {
    const records = [];
    const allKeys = Object.keys(FIELD_MAP);

    families.forEach((f) => {
      allKeys.forEach((key) => {
        const raw = f[FIELD_MAP[key].fField];
        const val = normalizeHealthValue(raw);
        if (val) {
          records.push({
            uid: 'f-' + f.id + key,
            famId: f.id,
            name: f.head_name,
            role: 'رب الأسرة',
            healthType: FIELD_MAP[key].label,
            key,
            val,
            camp: campMap[f.camp_id] || '—',
            camp_id: f.camp_id || '',
            tent: f.tent || '—',
          });
        }
      });
    });

    members.forEach((m) => {
      const f = famMap[m.family_id] || {};
      allKeys.forEach((key) => {
        const raw = m[FIELD_MAP[key].mField];
        const val = normalizeHealthValue(raw);
        if (val) {
          records.push({
            uid: 'm-' + m.id + key,
            famId: f.id,
            name: m.name || '—',
            role: m.relation || 'فرد',
            healthType: FIELD_MAP[key].label,
            key,
            val,
            camp: campMap[f.camp_id] || '—',
            camp_id: f.camp_id || '',
            tent: f.tent || '—',
          });
        }
      });
    });

    return records;
  }, [families, members, famMap, campMap]);

  // أعداد كل فئة بالمخيم المختار (بلا تأثير فلتر النوع الحالي) عشان تظهر
  // ثابتة جنب كل زر فلتر بغض النظر عن أي فئة مفعّلة حالياً
  const campRecords = useMemo(
    () => (filterCamp ? allRecords.filter((r) => r.camp_id === filterCamp) : allRecords),
    [allRecords, filterCamp]
  );
  const typeCounts = useMemo(() => {
    const counts = { all: campRecords.length };
    Object.keys(FIELD_MAP).forEach((key) => {
      counts[key] = campRecords.filter((r) => r.key === key).length;
    });
    return counts;
  }, [campRecords]);

  const healthData = useMemo(() => {
    return campRecords
      .filter((r) => healthType === 'all' || r.key === healthType)
      .filter((r) => !search.trim() || (r.name || '').includes(search) || (r.val || '').includes(search))
      .sort((a, b) => naturalCompare(a.tent, b.tent));
  }, [campRecords, healthType, search]);

  const HEALTH_COLOR = { chronic: colors.accent, disability: colors.blue, injury: colors.red, needs: colors.purple };

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

  const renderHealth = ({ item: r }) => (
    <Pressable style={styles.card} onPress={() => r.famId && navigation.push('FamilyDetail', { familyId: r.famId })}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName}>{r.name} <Text style={styles.cardMeta}>({r.role})</Text></Text>
        <Badge label={r.healthType} color={HEALTH_COLOR[r.key] || colors.muted} />
      </View>
      <View style={styles.healthValueBox}>
        <Text style={styles.healthValueText}>{r.val}</Text>
      </View>
      <Text style={styles.cardSubMeta}>⛺{r.tent} 🏕️{r.camp} — اضغط للانتقال للأسرة ←</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={healthData}
        keyExtractor={(item) => item.uid}
        renderItem={renderHealth}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="🩺"
              title="سجل الحالات الصحية"
              action={
                <ExportButton
                  getRows={() =>
                    healthData.map((r, i) => ({
                      '#': i + 1,
                      'الخيمة': r.tent,
                      'الاسم': r.name,
                      'الصلة': r.role,
                      'النوع': r.healthType,
                      'الحالة': r.val,
                      'المخيم': r.camp,
                    }))
                  }
                  sheetName="الصحة"
                  fileName="سجل_الصحة"
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

            <View style={styles.chipsRow}>
              {HEALTH_TYPES.map((t) => (
                <FilterChip
                  key={t.key}
                  label={`${t.icon} ${t.label} (${typeCounts[t.key] || 0})`}
                  selected={healthType === t.key}
                  onPress={() => setHealthType(t.key)}
                />
              ))}
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <Text style={styles.countText}>{healthData.length} حالة</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="🩺" title="لا توجد نتائج" />}
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

    searchInput: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 8,
    },
    countText: { color: colors.muted, fontSize: 11, marginBottom: 10, textAlign: 'right' },

    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
    cardMeta: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
    cardSubMeta: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },

    healthValueBox: { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },
    healthValueText: { color: colors.white, fontSize: 12, textAlign: 'right' },

    campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
  });
