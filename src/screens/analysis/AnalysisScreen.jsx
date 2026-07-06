import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { calcAge, hasHealthData, getOrphanCount } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import colors from '../../theme/colors';

const AGE_GROUPS = [
  { label: 'رضيع 0-2', min: 0, max: 2 },
  { label: 'طفل 3-12', min: 3, max: 12 },
  { label: 'مراهق 13-17', min: 13, max: 17 },
  { label: 'شاب 18-35', min: 18, max: 35 },
  { label: 'كهل 36-59', min: 36, max: 59 },
  { label: 'مسن 60+', min: 60, max: 200 },
];

const TABS = [
  { key: 'overview', label: '📊 عام' },
  { key: 'age', label: '🎂 الأعمار' },
  { key: 'health', label: '🏥 الصحة' },
  { key: 'women', label: '👩 نساء' },
  { key: 'children', label: '🧒 أطفال' },
  { key: 'camps', label: '🏕️ مخيمات' },
];

const REQUIRED_FIELDS = ['head_name', 'head_id', 'phone1', 'camp_id'];

function StatBar({ label, count, total, color, onPress }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Pressable style={styles.barBlock} onPress={onPress} disabled={!count}>
      <View style={styles.barLabelRow}>
        <Text style={styles.barName}>{label}</Text>
        <Text style={[styles.barCount, { color }]}>{count}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </Pressable>
  );
}

export default function AnalysisScreen() {
  const navigation = useNavigation();
  const { orgId } = useAuth();
  const { getAllowedCampIds, filterLocal } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [filterCamp, setFilterCamp] = useState('all');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [tab, setTab] = useState('overview');
  const [drillDown, setDrillDown] = useState(null); // { title, items }
  const [drillSearch, setDrillSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const campsData = await fetchCamps(orgId);
      const allowedCampIds = getAllowedCampIds(campsData);
      const famsRaw = await fetchFamilies(orgId);
      const fams = filterLocal(famsRaw, allowedCampIds);
      setCamps(campsData);
      setFamilies(fams);
      setMembers(await fetchFamilyMembers(fams.map((f) => f.id)));
    } catch (e) {
      showError('تعذّر تحميل التحليلات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, filterLocal]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);

  const scopedFams = useMemo(
    () => (filterCamp === 'all' ? families : families.filter((f) => f.camp_id === filterCamp)),
    [families, filterCamp]
  );

  const stats = useMemo(() => {
    const fams = scopedFams;
    const famIds = new Set(fams.map((f) => f.id));
    const mems = members.filter((m) => famIds.has(m.family_id));
    const famNameMap = Object.fromEntries(fams.map((f) => [f.id, f.head_name]));

    const allPersons = [
      ...fams.map((f) => ({
        personName: f.head_name,
        personId: f.head_id,
        personGender: f.head_gender,
        personDob: f.head_dob,
        famId: f.id,
        famName: f.head_name,
        campName: campMap[f.camp_id],
        relation: 'رب الأسرة',
        disabilities: f.head_disabilities,
        injuries: f.head_injuries,
        chronic: f.head_chronic_diseases,
      })),
      ...mems.map((m) => ({
        personName: m.name,
        personId: m.national_id,
        personGender: m.gender,
        personDob: m.dob,
        famId: m.family_id,
        famName: famNameMap[m.family_id] || '—',
        campName: campMap[fams.find((f) => f.id === m.family_id)?.camp_id],
        relation: m.relation,
        disabilities: m.disabilities,
        injuries: m.injuries,
        chronic: m.chronic_diseases,
      })),
    ];

    const byCamp = camps
      .map((c) => ({ id: c.id, name: c.name, count: fams.filter((f) => f.camp_id === c.id).length }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);

    const ageData = AGE_GROUPS.map((g) => {
      const persons = allPersons.filter((p) => {
        const a = calcAge(p.personDob);
        return a !== null && a >= g.min && a <= g.max;
      });
      return { label: g.label, count: persons.length, persons };
    });

    const males = allPersons.filter((p) => p.personGender === 'ذكر' || p.personGender === 'male');
    const females = allPersons.filter((p) => p.personGender === 'أنثى' || p.personGender === 'female');
    const noGenderPersons = allPersons.filter(
      (p) => p.personGender !== 'ذكر' && p.personGender !== 'male' && p.personGender !== 'أنثى' && p.personGender !== 'female'
    );

    const disabledPersons = allPersons.filter((p) => hasHealthData(p.disabilities));
    const injuredPersons = allPersons.filter((p) => hasHealthData(p.injuries));
    const chronicPersons = allPersons.filter((p) => hasHealthData(p.chronic));
    const healthyCount =
      allPersons.length -
      new Set([...disabledPersons, ...injuredPersons, ...chronicPersons].map((p) => p.personId + p.famId)).size;

    const women = females;
    const womenGroups = AGE_GROUPS.map((g) => {
      const persons = women.filter((w) => {
        const a = calcAge(w.personDob);
        return a !== null && a >= g.min && a <= g.max;
      });
      return { label: g.label, count: persons.length, persons };
    });

    const childPersons = allPersons.filter((p) => {
      const a = calcAge(p.personDob);
      return a !== null && a < 18;
    });

    const memsByFam = {};
    mems.forEach((m) => {
      if (!memsByFam[m.family_id]) memsByFam[m.family_id] = [];
      memsByFam[m.family_id].push(m);
    });
    const orphans = fams.reduce((sum, f) => sum + getOrphanCount(f, memsByFam[f.id]), 0);

    const incomplete = fams.filter((f) => REQUIRED_FIELDS.some((k) => !f[k]?.toString().trim())).length;

    return {
      total: fams.length,
      totalPersons: fams.length + mems.length,
      byCamp,
      ageData,
      males: males.length,
      females: females.length,
      noGender: noGenderPersons.length,
      malePersons: males,
      femalePersons: females,
      noGenderPersons,
      healthData: {
        سليم: Math.max(healthyCount, 0),
        معاق: disabledPersons.length,
        مصاب: injuredPersons.length,
        مزمن: chronicPersons.length,
      },
      healthPersons: { معاق: disabledPersons, مصاب: injuredPersons, مزمن: chronicPersons },
      women: women.length,
      womenGroups,
      children: childPersons.length,
      childPersons,
      orphans,
      incomplete,
    };
  }, [scopedFams, members, camps, campMap]);

  const openDrillDownPersons = (title, persons) => {
    if (!persons?.length) return;
    setDrillSearch('');
    setDrillDown({ title, items: persons });
  };

  const openDrillDownFamilies = (title, famList) => {
    if (!famList?.length) return;
    setDrillSearch('');
    setDrillDown({ title, items: famList.map((f) => ({ ...f, isFamily: true })) });
  };

  const drillFiltered = useMemo(() => {
    if (!drillDown) return [];
    const q = drillSearch.trim().toLowerCase();
    if (!q) return drillDown.items;
    return drillDown.items.filter((item) => {
      const name = item.personName || item.head_name || '';
      const id = item.personId || item.head_id || '';
      return name.toLowerCase().includes(q) || id.includes(q);
    });
  }, [drillDown, drillSearch]);

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
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <PageHeader icon="📈" title="التقارير والتحليلات" />

        <View style={styles.chipsRow}>
          <FilterChip
            label={filterCamp === 'all' ? `🏕️ كل المخيمات (${stats.total})` : `${campMap[filterCamp]} (${stats.total})`}
            selected={filterCamp !== 'all'}
            onPress={() => setCampPickerVisible(true)}
          />
        </View>

        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <FilterChip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />
          ))}
        </View>

        {tab === 'overview' && (
          <View style={styles.grid}>
            {[
              ['👨‍👩‍👧‍👦', stats.total, 'أسرة', colors.accent, () => openDrillDownFamilies('كل الأسر', scopedFams)],
              ['👤', stats.totalPersons, 'فرد', colors.blue, null],
              ['👶', stats.children, 'طفل', colors.green, () => openDrillDownPersons('الأطفال', stats.childPersons)],
              ['🕊️', stats.orphans, 'يتيم', colors.muted, null],
              ['⚠️', stats.incomplete, 'بيانات ناقصة', colors.red, null],
              ['🏕️', stats.byCamp.length, 'مخيم نشط', colors.accent, null],
            ].map(([icon, val, label, color, onPress], i) => (
              <Pressable key={i} style={styles.statBox} onPress={onPress || undefined} disabled={!onPress}>
                <Text style={styles.statIcon}>{icon}</Text>
                <Text style={[styles.statValue, { color }]}>{val}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {tab === 'age' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>🎂 التوزيع العمري</Text>
            {stats.ageData.map((g) => (
              <StatBar
                key={g.label}
                label={g.label}
                count={g.count}
                total={stats.totalPersons}
                color={colors.accent}
                onPress={() => openDrillDownPersons(g.label, g.persons)}
              />
            ))}
          </View>
        )}

        {tab === 'health' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>🏥 الحالات الصحية</Text>
            <StatBar label="✅ سليم" count={stats.healthData.سليم} total={stats.totalPersons} color={colors.green} />
            <StatBar
              label="♿ إعاقة"
              count={stats.healthData.معاق}
              total={stats.totalPersons}
              color={colors.blue}
              onPress={() => openDrillDownPersons('ذوو إعاقة', stats.healthPersons.معاق)}
            />
            <StatBar
              label="🩹 إصابة"
              count={stats.healthData.مصاب}
              total={stats.totalPersons}
              color={colors.red}
              onPress={() => openDrillDownPersons('المصابون', stats.healthPersons.مصاب)}
            />
            <StatBar
              label="💊 مرض مزمن"
              count={stats.healthData.مزمن}
              total={stats.totalPersons}
              color={colors.accent}
              onPress={() => openDrillDownPersons('أصحاب الأمراض المزمنة', stats.healthPersons.مزمن)}
            />
          </View>
        )}

        {tab === 'women' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>👩 النساء ({stats.women})</Text>
            {stats.womenGroups.map((g) => (
              <StatBar
                key={g.label}
                label={g.label}
                count={g.count}
                total={stats.women}
                color={colors.blue}
                onPress={() => openDrillDownPersons(`نساء — ${g.label}`, g.persons)}
              />
            ))}
          </View>
        )}

        {tab === 'children' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>🧒 الأطفال ({stats.children})</Text>
            <StatBar
              label="🕊️ أيتام"
              count={stats.orphans}
              total={stats.children}
              color={colors.muted}
            />
            <Pressable style={styles.viewAllBtn} onPress={() => openDrillDownPersons('كل الأطفال', stats.childPersons)}>
              <Text style={styles.viewAllText}>عرض كل الأطفال ←</Text>
            </Pressable>
          </View>
        )}

        {tab === 'camps' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>🏕️ توزيع المخيمات</Text>
            {stats.byCamp.map((c) => (
              <StatBar
                key={c.id}
                label={c.name}
                count={c.count}
                total={stats.total}
                color={colors.accent}
                onPress={() => openDrillDownFamilies(c.name, scopedFams.filter((f) => f.camp_id === c.id))}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <BottomSheetModal visible={campPickerVisible} onClose={() => setCampPickerVisible(false)} title="اختر المخيم">
        <Pressable style={styles.drillRow} onPress={() => { setFilterCamp('all'); setCampPickerVisible(false); }}>
          <Text style={styles.drillName}>🏕️ كل المخيمات</Text>
        </Pressable>
        {camps.map((c) => (
          <Pressable key={c.id} style={styles.drillRow} onPress={() => { setFilterCamp(c.id); setCampPickerVisible(false); }}>
            <Text style={styles.drillName}>{c.name}</Text>
          </Pressable>
        ))}
      </BottomSheetModal>

      <BottomSheetModal
        visible={!!drillDown}
        onClose={() => setDrillDown(null)}
        title={drillDown?.title || ''}
      >
        <TextInput
          value={drillSearch}
          onChangeText={setDrillSearch}
          placeholder="🔍 بحث بالاسم أو الهوية..."
          placeholderTextColor={colors.muted}
          style={styles.drillSearch}
        />
        <FlatList
          data={drillFiltered}
          keyExtractor={(item, i) => item.id || item.famId + i}
          style={{ maxHeight: 400 }}
          renderItem={({ item, index }) => {
            const isPerson = !!item.personName;
            const name = item.personName || item.head_name;
            const subId = item.personId || item.head_id;
            const famId = item.famId || item.id;
            return (
              <Pressable
                style={styles.drillRow}
                onPress={() => {
                  setDrillDown(null);
                  navigation.navigate('FamilyDetail', { familyId: famId });
                }}
              >
                <Text style={styles.drillName}>{index + 1}. {name}</Text>
                {isPerson && item.famName && <Text style={styles.drillMeta}>أسرة: {item.famName}</Text>}
                <Text style={styles.drillMeta}>{subId} {item.campName ? `· ${item.campName}` : ''}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.drillEmpty}>لا توجد نتائج</Text>}
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBox: { width: '31%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, alignItems: 'center', marginBottom: 8 },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 9, marginTop: 2, textAlign: 'center' },

  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  panelTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 13, marginBottom: 12, textAlign: 'right' },
  barBlock: { marginBottom: 12 },
  barLabelRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 },
  barName: { color: colors.white, fontSize: 11 },
  barCount: { fontSize: 12, fontWeight: 'bold' },
  barTrack: { height: 8, backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },

  viewAllBtn: { marginTop: 8, alignItems: 'center' },
  viewAllText: { color: colors.accent, fontWeight: 'bold', fontSize: 12 },

  drillSearch: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: colors.white,
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 10,
  },
  drillRow: { backgroundColor: colors.surface2, borderRadius: 10, padding: 10, marginBottom: 6 },
  drillName: { color: colors.white, fontWeight: 'bold', fontSize: 12, textAlign: 'right' },
  drillMeta: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
  drillEmpty: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 20 },
});
