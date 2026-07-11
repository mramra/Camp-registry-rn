import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { getFamilyCategories, getOrphanCount, hasHealthData } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import Badge from '../../components/ui/Badge';
import ExportButton from '../../components/ui/ExportButton';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import colors from '../../theme/colors';

const CAT_LABELS = {
  normal: { label: 'أسرة عادية', icon: '🏠', color: colors.muted },
  martyr: { label: 'أسر شهداء', icon: '🕊️', color: colors.blue },
  captive: { label: 'أسر أسرى', icon: '⛓️', color: colors.blue },
  no_provider: { label: 'فاقد معيل', icon: '💔', color: colors.red },
  large: { label: 'أسرة كبيرة', icon: '👨‍👩‍👧‍👦', color: colors.green },
};

const HEALTH_TYPES = {
  معاق: { label: 'إعاقة', icon: '🦽' },
  مصاب: { label: 'إصابة حرب', icon: '🩹' },
  مزمن: { label: 'مرض مزمن', icon: '💊' },
};

function memberHealthKeys(m) {
  const keys = [];
  if (hasHealthData(m.disabilities)) keys.push('معاق');
  if (hasHealthData(m.injuries)) keys.push('مصاب');
  if (hasHealthData(m.chronic_diseases)) keys.push('مزمن');
  return keys;
}

export default function NeedsReportScreen() {
  const navigation = useNavigation();
  const { orgId } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [filterCamp, setFilterCamp] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterHealth, setFilterHealth] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const campsData = await fetchCamps(orgId);
      const allowedCampIds = getAllowedCampIds(campsData);
      const famsRaw = await fetchFamilies(orgId);
      const fams = filterLocal(famsRaw, allowedCampIds);
      setFamilies(fams);
      setCamps(getVisibleCamps(campsData));
      setMembers(await fetchFamilyMembers(fams.map((f) => f.id)));
    } catch (e) {
      showError('تعذّر تحميل تقرير الاحتياجات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, filterLocal, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);
  const memsByFamily = useMemo(() => {
    const m = {};
    members.forEach((x) => {
      if (!m[x.family_id]) m[x.family_id] = [];
      m[x.family_id].push(x);
    });
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    return families.filter((f) => {
      if (filterCamp && f.camp_id !== filterCamp) return false;
      if (filterCat && !getFamilyCategories(f, memsByFamily[f.id]).includes(filterCat)) return false;
      if (filterHealth) {
        const mems = memsByFamily[f.id] || [];
        if (!mems.some((m) => memberHealthKeys(m).includes(filterHealth))) return false;
      }
      return true;
    });
  }, [families, filterCamp, filterCat, filterHealth, memsByFamily]);

  const quickStats = useMemo(() => {
    const s = {};
    Object.keys(CAT_LABELS).forEach((k) => { s[k] = 0; });
    families.forEach((f) => {
      getFamilyCategories(f, memsByFamily[f.id]).forEach((c) => { s[c] = (s[c] || 0) + 1; });
    });
    s.orphans = families.filter((f) => getOrphanCount(f, memsByFamily[f.id]) > 0).length;
    s.disabled = members.filter((m) => hasHealthData(m.disabilities)).length;
    s.injured = members.filter((m) => hasHealthData(m.injuries)).length;
    s.chronic = members.filter((m) => hasHealthData(m.chronic_diseases)).length;
    return s;
  }, [families, members, memsByFamily]);

  const getExportRows = () =>
    filtered.map((f) => {
      const mems = memsByFamily[f.id] || [];
      return {
        'اسم الأسرة': f.head_name || '',
        'رقم الهوية': f.head_id || '',
        الجوال: f.phone1 || '',
        المخيم: campMap[f.camp_id] || '',
        'عدد الأفراد': mems.length + 1,
        الفئات: getFamilyCategories(f, mems).map((c) => CAT_LABELS[c]?.label || c).join(' | '),
        الأيتام: getOrphanCount(f, mems),
      };
    });

  const renderFamily = ({ item: f }) => {
    const mems = memsByFamily[f.id] || [];
    const orphanCount = getOrphanCount(f, mems);
    const unhealthy = mems.flatMap((m) => memberHealthKeys(m).map((k) => ({ m, k })));

    return (
      <Pressable style={styles.card} onPress={() => navigation.push('FamilyDetail', { familyId: f.id })}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headName}>{f.head_name}</Text>
            <Text style={styles.headId}>{f.head_id}</Text>
            {!!campMap[f.camp_id] && <Text style={styles.campText}>🏕️ {campMap[f.camp_id]}</Text>}
            <View style={styles.badgesRow}>
              {getFamilyCategories(f, mems).map((c) => (
                <Badge key={c} label={`${CAT_LABELS[c]?.icon || ''} ${CAT_LABELS[c]?.label || c}`} color={CAT_LABELS[c]?.color || colors.muted} />
              ))}
              {orphanCount > 0 && <Badge label={`🕊️ ${orphanCount} يتيم`} color={colors.red} />}
            </View>
            {unhealthy.length > 0 && (
              <Text style={styles.unhealthyText}>
                {unhealthy.map(({ m, k }) => `${HEALTH_TYPES[k]?.icon || '⚠️'} ${m.name}`).join(' · ')}
              </Text>
            )}
          </View>
          <Text style={styles.memberCount}>👥 {mems.length + 1}</Text>
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
        data={filtered.slice(0, 100)}
        keyExtractor={(item) => item.id}
        renderItem={renderFamily}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="📋"
              title="تقارير الاحتياجات"
              subtitle={<Text style={styles.headerSubtitle}>{filtered.length} أسرة</Text>}
              action={<ExportButton getRows={getExportRows} sheetName="تقرير الاحتياجات" fileName="تقرير_الاحتياجات" />}
            />

            <View style={styles.statsGrid}>
              {Object.entries(CAT_LABELS).map(([k, v]) => (
                <Pressable
                  key={k}
                  style={[styles.statBox, filterCat === k && styles.statBoxActive]}
                  onPress={() => setFilterCat(filterCat === k ? '' : k)}
                >
                  <Text style={styles.statIcon}>{v.icon}</Text>
                  <Text style={[styles.statValue, { color: v.color }]}>{quickStats[k]}</Text>
                  <Text style={styles.statLabel}>{v.label}</Text>
                </Pressable>
              ))}
              <View style={styles.statBox}>
                <Text style={styles.statIcon}>🕊️</Text>
                <Text style={[styles.statValue, { color: colors.red }]}>{quickStats.orphans}</Text>
                <Text style={styles.statLabel}>أسر يتامى</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statIcon}>🦽</Text>
                <Text style={[styles.statValue, { color: colors.blue }]}>{quickStats.disabled}</Text>
                <Text style={styles.statLabel}>إعاقات</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statIcon}>🩹</Text>
                <Text style={[styles.statValue, { color: colors.accent }]}>{quickStats.injured}</Text>
                <Text style={styles.statLabel}>إصابات</Text>
              </View>
            </View>

            <View style={styles.chipsRow}>
              <FilterChip
                label={filterCamp ? campMap[filterCamp] : '🏕️ كل المخيمات'}
                selected={!!filterCamp}
                onPress={() => setCampPickerVisible(true)}
              />
            </View>
            <View style={styles.chipsRow}>
              <FilterChip label="🏥 الكل" selected={!filterHealth} onPress={() => setFilterHealth('')} />
              {Object.entries(HEALTH_TYPES).map(([k, v]) => (
                <FilterChip key={k} label={`${v.icon} ${v.label}`} selected={filterHealth === k} onPress={() => setFilterHealth(k)} />
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="📋" title="لا توجد نتائج" subtitle="جرّب تغيير الفلاتر" />}
        ListFooterComponent={
          filtered.length > 100 ? (
            <Text style={styles.footerHint}>عرض 100 من {filtered.length} — استخدم التصدير للكل</Text>
          ) : null
        }
      />

      <BottomSheetModal visible={campPickerVisible} onClose={() => setCampPickerVisible(false)} title="اختر المخيم">
        <Pressable style={styles.pickerOption} onPress={() => { setFilterCamp(''); setCampPickerVisible(false); }}>
          <Text style={styles.pickerOptionText}>كل المخيمات</Text>
        </Pressable>
        {camps.map((c) => (
          <Pressable key={c.id} style={styles.pickerOption} onPress={() => { setFilterCamp(c.id); setCampPickerVisible(false); }}>
            <Text style={styles.pickerOptionText}>{c.name}</Text>
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

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  statBox: { width: '31%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8, alignItems: 'center' },
  statBoxActive: { borderColor: colors.accent, backgroundColor: 'rgba(245,158,11,0.1)' },
  statIcon: { fontSize: 15, marginBottom: 2 },
  statValue: { fontSize: 14, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 8, marginTop: 2, textAlign: 'center' },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  headName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  headId: { color: colors.white, fontSize: 11, textAlign: 'right', marginTop: 2 },
  campText: { color: colors.blue, fontSize: 11, marginTop: 2, textAlign: 'right' },
  badgesRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  unhealthyText: { color: colors.muted, fontSize: 10, marginTop: 6, textAlign: 'right' },
  memberCount: { color: colors.accent, fontWeight: 'bold', fontSize: 11 },

  pickerOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
  footerHint: { color: colors.muted, fontSize: 11, textAlign: 'center', paddingVertical: 10 },
});
