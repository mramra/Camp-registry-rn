import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { calcAge, naturalCompare } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import Badge from '../../components/ui/Badge';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import ExportButton from '../../components/ui/ExportButton';
import colors from '../../theme/colors';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';

const TABS = [
  { id: 'children', label: '👶 الأطفال' },
  { id: 'women', label: '👩 النساء' },
  { id: 'health', label: '🏥 الصحة' },
];

const AGE_GROUPS = [
  { key: '0-2', min: 0, max: 2 },
  { key: '3-6', min: 3, max: 6 },
  { key: '7-12', min: 7, max: 12 },
  { key: '13-17', min: 13, max: 17 },
];

/**
 * قيم الحالات الصحية تختلف شكلها فعلياً حسب الجدول (تأكدنا من db.js الأصلي):
 * - family_members.disabilities/injuries/chronic_diseases: مصفوفة Postgres حقيقية
 *   (JS array فعلي عبر REST مباشرة)
 * - families.head_disabilities/... : نص JSON (قد يصل كسلسلة نصية، أو أحياناً
 *   يُفكّكه PostgREST تلقائياً حسب نوع العمود الفعلي بقاعدة البيانات)
 * هذه الدالة تتعامل مع الحالتين بأمان بدل افتراض إنه نص دايماً (كان هذا
 * بالضبط سبب خطأ 'trim is not a function' — القيمة كانت مصفوفة فعلية).
 */
function normalizeHealthValue(raw, depth = 0) {
  if (!raw || depth > 3) return '';
  if (Array.isArray(raw)) {
    // كل عنصر إما نص جاهز، أو كائن {type, detail} (شكل حقيقي بجدول family_members)
    const parts = raw
      .filter(Boolean)
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const type = item.type || '';
          const detail = item.detail ? ` (${item.detail})` : '';
          return type ? `${type}${detail}` : '';
        }
        return '';
      })
      .filter(Boolean);
    return parts.join('، ');
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '[]' || trimmed === '""' || trimmed === 'null') return '';
    try {
      const parsed = JSON.parse(trimmed);
      // ترميز مزدوج محتمل (نص JSON داخل نص JSON) — نطبّع بشكل متكرر بحد أقصى
      if (Array.isArray(parsed) || typeof parsed === 'string') {
        return normalizeHealthValue(parsed, depth + 1);
      }
    } catch {
      // ليست JSON — نص عادي فعلي، نُرجعه كما هو
    }
    return trimmed;
  }
  return String(raw);
}

const HEALTH_TYPES = [
  { key: 'all', label: 'الكل', icon: '🏥' },
  { key: 'chronic', label: 'أمراض مزمنة', icon: '💊' },
  { key: 'disability', label: 'إعاقات', icon: '♿' },
  { key: 'injury', label: 'إصابات', icon: '🩹' },
];

export default function RegistersScreen() {
  const navigation = useNavigation();
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [tab, setTab] = useState('children');
  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [womenType, setWomenType] = useState('');
  const [healthType, setHealthType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    // 1) اعرض النسخة المحفوظة فوراً (لو موجودة) — بدون انتظار الشبكة.
    const cached = await getCachedData('registers', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      setFamilies(cached.data.families || []);
      setMembers(cached.data.members || []);
      setCamps(cached.data.camps || []);
      setOfflineInfo({ savedAt: cached.savedAt });
      setLoading(false);
    }

    // 2) بعدين حاول تحديث حي بالخلفية.
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
      cacheData('registers', profile?.id, { families: fams, members: mems, camps: visibleCamps });
    } catch (e) {
      if (!hadCache) showError('تعذّر تحميل السجلات ولا توجد نسخة محفوظة');
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

  // ── بيانات الأطفال ──────────────────────────────────
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
      .filter((k) => !search.trim() || (k.name || '').includes(search) || (k.famName || '').includes(search))
      .sort((a, b) => naturalCompare(a.tent, b.tent));
  }, [members, famMap, campMap, filterCamp, ageFilter, search]);

  const ageGroupCounts = useMemo(() => {
    const all = members.map((m) => calcAge(m.dob)).filter((a) => a !== null && a < 18);
    return AGE_GROUPS.map((g) => ({ ...g, count: all.filter((a) => a >= g.min && a <= g.max).length }));
  }, [members]);

  // ── بيانات النساء ───────────────────────────────────
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

  // ── بيانات الصحة ────────────────────────────────────
  const healthData = useMemo(() => {
    const FIELD_MAP = {
      chronic: { fField: 'head_chronic_diseases', mField: 'chronic_diseases', label: 'أمراض مزمنة' },
      disability: { fField: 'head_disabilities', mField: 'disabilities', label: 'إعاقة' },
      injury: { fField: 'head_injuries', mField: 'injuries', label: 'إصابة' },
    };
    const records = [];

    families.forEach((f) => {
      const entries = healthType === 'all' ? Object.keys(FIELD_MAP) : [healthType];
      entries.forEach((key) => {
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
      const entries = healthType === 'all' ? Object.keys(FIELD_MAP) : [healthType];
      entries.forEach((key) => {
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

    return records
      .filter((r) => !filterCamp || r.camp_id === filterCamp)
      .filter((r) => !search.trim() || (r.name || '').includes(search) || (r.val || '').includes(search))
      .sort((a, b) => naturalCompare(a.tent, b.tent));
  }, [families, members, famMap, campMap, filterCamp, healthType, search]);

  const HEALTH_COLOR = { chronic: colors.accent, disability: colors.blue, injury: colors.red };

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

  const renderWoman = ({ item: w }) => (
    <View style={styles.card}>
      <Text style={styles.cardName}>{w.name} <Text style={styles.typeTag}>({w.type})</Text></Text>
      <Text style={styles.cardMeta}>{w.age ?? '—'} سنة • {w.marital} {w.status ? `• 🔸${w.status}` : ''}</Text>
      {!!w.chronic && <Text style={styles.chronicText}>🩺 {w.chronic}</Text>}
      <Text style={styles.cardSubMeta}>⛺{w.tent} 🏕️{w.camp}</Text>
    </View>
  );

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
        data={tab === 'children' ? childrenData : tab === 'women' ? womenData : healthData}
        keyExtractor={(item) => item.id || item.uid}
        renderItem={tab === 'children' ? renderChild : tab === 'women' ? renderWoman : renderHealth}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="📋"
              title="السجلات"
              action={
                <ExportButton
                  getRows={() => {
                    if (tab === 'children') {
                      return childrenData.map((k, i) => ({
                        '#': i + 1,
                        'الخيمة': k.tent,
                        'الاسم': k.name,
                        'رقم الهوية': k.national_id || '',
                        'العمر': k.age,
                        'الصلة': k.relation || '',
                        'الجنس': k.gender || '',
                        'رب الأسرة': k.famName,
                        'المخيم': k.camp,
                      }));
                    }
                    if (tab === 'women') {
                      return womenData.map((w, i) => ({
                        '#': i + 1,
                        'الخيمة': w.tent,
                        'الاسم': w.name,
                        'العمر': w.age ?? '',
                        'الصلة': w.type,
                        'الحالة الاجتماعية': w.marital,
                        'الوضع': w.status,
                        'أمراض مزمنة': w.chronic,
                        'المخيم': w.camp,
                      }));
                    }
                    return healthData.map((r, i) => ({
                      '#': i + 1,
                      'الخيمة': r.tent,
                      'الاسم': r.name,
                      'الصلة': r.role,
                      'النوع': r.healthType,
                      'الحالة': r.val,
                      'المخيم': r.camp,
                    }));
                  }}
                  sheetName={tab === 'children' ? 'الأطفال' : tab === 'women' ? 'النساء' : 'الصحة'}
                  fileName={tab === 'children' ? 'سجل_الأطفال' : tab === 'women' ? 'سجل_النساء' : 'سجل_الصحة'}
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

            <View style={styles.tabsRow}>
              {TABS.map((t) => (
                <FilterChip key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />
              ))}
            </View>

            {tab === 'children' && (
              <View style={styles.ageGrid}>
                {ageGroupCounts.map((g) => (
                  <Pressable
                    key={g.key}
                    style={[styles.ageBox, ageFilter === g.key && styles.ageBoxActive]}
                    onPress={() => setAgeFilter(ageFilter === g.key ? '' : g.key)}
                  >
                    <Text style={[styles.ageCount, ageFilter === g.key && styles.ageCountActive]}>{g.count}</Text>
                    <Text style={styles.ageLabel}>{g.key}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {tab === 'women' && (
              <>
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
              </>
            )}

            {tab === 'health' && (
              <View style={styles.chipsRow}>
                {HEALTH_TYPES.map((t) => (
                  <FilterChip
                    key={t.key}
                    label={`${t.icon} ${t.label}`}
                    selected={healthType === t.key}
                    onPress={() => setHealthType(t.key)}
                  />
                ))}
              </View>
            )}

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <Text style={styles.countText}>
              {tab === 'children' ? `${childrenData.length} طفل` : tab === 'women' ? `${womenData.length} امرأة` : `${healthData.length} حالة`}
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="📋" title="لا توجد نتائج" />}
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
    tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },

    ageGrid: { flexDirection: 'row', gap: 6, marginBottom: 12 },
    ageBox: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8, alignItems: 'center' },
    ageBoxActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
    ageCount: { color: colors.white, fontWeight: '900', fontSize: 14 },
    ageCountActive: { color: colors.accent },
    ageLabel: { color: colors.muted, fontSize: 9, marginTop: 2 },

    statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    statBox: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, alignItems: 'center' },
    statValue: { color: colors.accent, fontWeight: '900', fontSize: 16 },
    statLabel: { color: colors.muted, fontSize: 9, marginTop: 2 },

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
      marginBottom: 8,
    },
    countText: { color: colors.muted, fontSize: 11, marginBottom: 10, textAlign: 'right' },

    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
    ageTag: { color: colors.accent, fontWeight: '900' },
    typeTag: { color: colors.muted, fontWeight: 'normal', fontSize: 11 },
    cardMeta: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
    cardSubMeta: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },
    chronicText: { color: colors.accent, fontSize: 10, marginTop: 2, textAlign: 'right' },

    healthValueBox: { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },
    healthValueText: { color: colors.white, fontSize: 12, textAlign: 'right' },

    campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
  });
