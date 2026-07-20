import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps, fetchOrgMembers } from '../../lib/supabase';
import {
  getFamilyCategories, getOrphanCount, getVulnerabilityScore, hasHealthData,
  CATEGORY_LABELS, VULNERABILITY_TIER_LABELS, buildCampExportBanner,
} from '../../lib/helpers';
import { showError } from '../../utils/toast';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import Badge from '../../components/ui/Badge';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import ExportButton from '../../components/ui/ExportButton';
import CampDelegatePanel from '../../components/ui/CampDelegatePanel';
import colors from '../../theme/colors';

// فئات الأسر القابلة للفلترة عبر بطاقات الإحصائيات السريعة (نفس منطق
// getFamilyCategories المركزي بـhelpers.js -- شهيد/أسير مخزّنة، فاقد
// معيل/كبيرة محسوبة تلقائياً). "normal" تُستثنى من هذه الشبكة لأنها
// الحالة الافتراضية ولا تمثّل احتياجاً بحد ذاتها.
const CATEGORY_KEYS = ['martyr', 'captive', 'no_provider', 'large'];
const CATEGORY_COLOR = { martyr: colors.purple, captive: colors.blue, no_provider: colors.red, large: colors.green };

const TIER_KEYS = ['critical', 'high', 'medium', 'low'];
const TIER_COLOR = { critical: colors.red, high: colors.orange, medium: colors.accent, low: colors.green };

// نفس خريطة حقول الحالة الصحية المستخدمة بشاشة "سجل الحالات الصحية" —
// موحّدة عبر الأسرة (head_*) والأفراد (mField)، عشان لا يختلف تعريف
// "أسرة فيها حالة صحية" بين الشاشتين.
const HEALTH_TYPES = [
  { key: 'chronic', label: '💊 مزمن', fField: 'head_chronic_diseases', mField: 'chronic_diseases' },
  { key: 'disability', label: '♿ إعاقة', fField: 'head_disabilities', mField: 'disabilities' },
  { key: 'injury', label: '🩹 إصابة', fField: 'head_injuries', mField: 'injuries' },
  { key: 'needs', label: '🦽 احتياج', fField: 'head_needs', mField: 'needs' },
];

function familyHasHealthType(type, family, members) {
  const def = HEALTH_TYPES.find((h) => h.key === type);
  if (!def) return false;
  if (hasHealthData(family?.[def.fField])) return true;
  return (members || []).some((m) => hasHealthData(m[def.mField]));
}

export default function NeedsReportScreen() {
  const navigation = useNavigation();
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [showBanner, setShowBanner] = useState(true);
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterHealth, setFilterHealth] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const cached = await getCachedData('needs_report', profile?.id);
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
      cacheData('needs_report', profile?.id, { families: fams, members: mems, camps: visibleCamps, orgMembers: members2 });
    } catch (e) {
      if (!hadCache) showError('تعذّر تحميل التقرير ولا توجد نسخة محفوظة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);
  const memsByFamily = useMemo(() => {
    const m = {};
    members.forEach((x) => { (m[x.family_id] ||= []).push(x); });
    return m;
  }, [members]);

  // إحصائيات سريعة -- تُحسب من كامل الأسر المسموحة (بدون فلتر المخيم/الفئة)
  // نفس منطق النسخة الأصلية بالويب: الأرقام بالبطاقات ثابتة، والضغط عليها
  // يبدّل فلتر القائمة تحتها فقط.
  const quickStats = useMemo(() => {
    const s = { martyr: 0, captive: 0, no_provider: 0, large: 0, orphans: 0, disability: 0, injury: 0, chronic: 0 };
    families.forEach((f) => {
      const mems = memsByFamily[f.id] || [];
      getFamilyCategories(f, mems).forEach((c) => { if (s[c] !== undefined) s[c] += 1; });
      if (getOrphanCount(f, mems) > 0) s.orphans += 1;
      if (familyHasHealthType('disability', f, mems)) s.disability += 1;
      if (familyHasHealthType('injury', f, mems)) s.injury += 1;
      if (familyHasHealthType('chronic', f, mems)) s.chronic += 1;
    });
    return s;
  }, [families, memsByFamily]);

  const filtered = useMemo(() => {
    return families
      .filter((f) => !filterCamp || f.camp_id === filterCamp)
      .filter((f) => !filterCategory || getFamilyCategories(f, memsByFamily[f.id]).includes(filterCategory))
      .filter((f) => !filterTier || getVulnerabilityScore(f, memsByFamily[f.id]).tier === filterTier)
      .filter((f) => !filterHealth || familyHasHealthType(filterHealth, f, memsByFamily[f.id]))
      .filter((f) => !search.trim() || (f.head_name || '').includes(search) || (f.head_id || '').includes(search))
      .map((f) => ({ family: f, vuln: getVulnerabilityScore(f, memsByFamily[f.id]), cats: getFamilyCategories(f, memsByFamily[f.id]) }))
      // الأشد احتياجاً أولاً -- هذا هو الغرض الأساسي من التقرير
      .sort((a, b) => b.vuln.score - a.vuln.score);
  }, [families, memsByFamily, filterCamp, filterCategory, filterTier, filterHealth, search]);

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

  const renderRow = ({ item }) => {
    const { family: f, vuln, cats } = item;
    const mems = memsByFamily[f.id] || [];
    const orphanCount = getOrphanCount(f, mems);
    return (
      <Pressable style={styles.card} onPress={() => navigation.push('FamilyDetail', { familyId: f.id })}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{f.head_name}</Text>
            <Text style={styles.cardId}>{f.head_id}</Text>
            {!!campMap[f.camp_id] && <Text style={styles.cardCamp}>🏕️ {campMap[f.camp_id]}</Text>}
          </View>
          <Badge label={VULNERABILITY_TIER_LABELS[vuln.tier]} color={TIER_COLOR[vuln.tier]} />
        </View>
        <View style={styles.badgeRow}>
          {cats.filter((c) => c !== 'normal').map((c) => (
            <Badge key={c} label={CATEGORY_LABELS[c] || c} color={CATEGORY_COLOR[c] || colors.muted} />
          ))}
          {orphanCount > 0 && <Badge label={`🕊️ ${orphanCount} يتيم`} color={colors.red} />}
        </View>
        <Text style={styles.cardMeta}>
          👥 {mems.length + 1} فرد
          {vuln.disabilityCount > 0 ? ` · ♿ ${vuln.disabilityCount}` : ''}
          {vuln.chronicCount > 0 ? ` · 💊 ${vuln.chronicCount}` : ''}
          {vuln.elderlyCount > 0 ? ` · 👴 ${vuln.elderlyCount}` : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.family.id}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader icon="📋" title="تقرير الاحتياجات" subtitle={`${filtered.length} أسرة`} />

            {!!offlineInfo && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة
                </Text>
              </View>
            )}

            {/* بطاقات الفئات -- الضغط يبدّل فلتر الفئة */}
            <View style={styles.statsGrid}>
              {CATEGORY_KEYS.map((k) => (
                <Pressable
                  key={k}
                  style={[styles.statBox, filterCategory === k && styles.statBoxActive]}
                  onPress={() => setFilterCategory((v) => (v === k ? '' : k))}
                >
                  <Text style={[styles.statCount, { color: CATEGORY_COLOR[k] }]}>{quickStats[k]}</Text>
                  <Text style={styles.statLabel}>{CATEGORY_LABELS[k]}</Text>
                </Pressable>
              ))}
              <View style={styles.statBox}>
                <Text style={[styles.statCount, { color: colors.red }]}>{quickStats.orphans}</Text>
                <Text style={styles.statLabel}>🕊️ أسر يتامى</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statCount, { color: colors.purple }]}>{quickStats.disability}</Text>
                <Text style={styles.statLabel}>♿ إعاقات</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statCount, { color: colors.accent }]}>{quickStats.injury}</Text>
                <Text style={styles.statLabel}>🩹 إصابات</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statCount, { color: colors.blue }]}>{quickStats.chronic}</Text>
                <Text style={styles.statLabel}>💊 أمراض مزمنة</Text>
              </View>
            </View>

            {/* درجة الضعف */}
            <Text style={styles.sectionLabel}>درجة الضعف:</Text>
            <View style={styles.chipsWrap}>
              {TIER_KEYS.map((t) => (
                <FilterChip
                  key={t}
                  label={VULNERABILITY_TIER_LABELS[t]}
                  selected={filterTier === t}
                  onPress={() => setFilterTier((v) => (v === t ? '' : t))}
                />
              ))}
            </View>

            {/* الحالة الصحية */}
            <Text style={styles.sectionLabel}>الحالة الصحية:</Text>
            <View style={styles.chipsWrap}>
              {HEALTH_TYPES.map((h) => (
                <FilterChip
                  key={h.key}
                  label={h.label}
                  selected={filterHealth === h.key}
                  onPress={() => setFilterHealth((v) => (v === h.key ? '' : h.key))}
                />
              ))}
            </View>

            <View style={styles.chipsRow}>
              <FilterChip
                label={filterCamp ? campMap[filterCamp] : 'كل المخيمات'}
                selected={!!filterCamp}
                onPress={() => setCampPickerVisible(true)}
              />
              <ExportButton
                label="📊 تصدير التقرير"
                getRows={() =>
                  filtered.map(({ family: f, vuln, cats }, i) => ({
                    '#': i + 1,
                    'اسم رب الأسرة': f.head_name || '',
                    'رقم الهوية': f.head_id || '',
                    'الجوال': f.phone1 || '',
                    'المخيم': campMap[f.camp_id] || '',
                    'عدد الأفراد': (memsByFamily[f.id] || []).length + 1,
                    'الفئات': cats.filter((c) => c !== 'normal').map((c) => CATEGORY_LABELS[c] || c).join(' | '),
                    'درجة الضعف': VULNERABILITY_TIER_LABELS[vuln.tier],
                    'نقاط الضعف': vuln.score,
                    'الأيتام': getOrphanCount(f, memsByFamily[f.id]),
                    'إعاقات': vuln.disabilityCount,
                    'أمراض مزمنة': vuln.chronicCount,
                    'كبار السن': vuln.elderlyCount,
                  }))
                }
                sheetName="تقرير الاحتياجات"
                fileName={`تقرير_الاحتياجات_${new Date().toISOString().slice(0, 10)}`}
                getBanner={() => {
                  if (!filterCamp || !showBanner) return null;
                  return buildCampExportBanner(camps.find((c) => c.id === filterCamp), orgMembers);
                }}
              />
            </View>

            <CampDelegatePanel
              camp={camps.find((c) => c.id === filterCamp)}
              orgMembers={orgMembers}
              showBanner={showBanner}
              onToggleBanner={setShowBanner}
            />

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث بالاسم أو رقم الهوية..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="📋" title="لا توجد نتائج" subtitle="جرّب تغيير الفلاتر" />}
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

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    statBox: {
      flexGrow: 1, minWidth: '22%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingVertical: 10, alignItems: 'center',
    },
    statBoxActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
    statCount: { fontWeight: '900', fontSize: 15 },
    statLabel: { color: colors.muted, fontSize: 9, marginTop: 2, textAlign: 'center' },

    sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: 'bold', textAlign: 'right', marginBottom: 6, marginTop: 2 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 },

    searchInput: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 4,
    },

    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8 },
    cardTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between' },
    cardName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
    cardId: { color: colors.muted, fontSize: 11, textAlign: 'right', marginTop: 1 },
    cardCamp: { color: colors.blue, fontSize: 11, textAlign: 'right', marginTop: 2 },
    badgeRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4, marginTop: 6 },
    cardMeta: { color: colors.muted, fontSize: 10, marginTop: 6, textAlign: 'right' },

    campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
  });
