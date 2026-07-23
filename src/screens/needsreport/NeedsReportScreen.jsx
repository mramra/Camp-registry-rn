import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps, fetchOrgMembers } from '../../lib/supabase';
import {
  getFamilyCategories, getOrphanCount, getVulnerabilityScore, hasHealthData,
  CATEGORY_LABELS, VULNERABILITY_TIER_LABELS, VULNERABILITY_TIER_KEYS,
  HEALTH_FIELD_MAP,
} from '../../lib/helpers';
import { showError, showSuccess } from '../../utils/toast';
import { exportXLSX, exportXLSXMultiSheetWithBanners } from '../../lib/excelIO';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import Badge from '../../components/ui/Badge';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FieldPicker, { orderedSelected } from '../../components/ui/FieldPicker';
import CampDelegatePanel from '../../components/ui/CampDelegatePanel';
import colors from '../../theme/colors';

// فئات الأسر القابلة للفلترة عبر بطاقات الإحصائيات السريعة (نفس منطق
// getFamilyCategories المركزي بـhelpers.js -- شهيد/أسير مخزّنة، فاقد
// معيل/كبيرة محسوبة تلقائياً). "normal" تُستثنى من هذه الشبكة لأنها
// الحالة الافتراضية ولا تمثّل احتياجاً بحد ذاتها.
const CATEGORY_KEYS = ['martyr', 'captive', 'no_provider', 'large'];
const CATEGORY_COLOR = { martyr: colors.purple, captive: colors.blue, no_provider: colors.red, large: colors.green };

const TIER_COLOR = { critical: colors.red, high: colors.orange, medium: colors.accent, low: colors.green };

// تسميات قصيرة بإيموجي خاصة بهذه الشاشة (بطاقات مضغوطة)، لكن الحقول
// الفعلية (fField/mField) تُشتق من HEALTH_FIELD_MAP المركزية بـhelpers.js
// -- نفس المصدر المستخدم بشاشة "سجل الحالات الصحية"، عشان لا يختلف
// تعريف "أسرة فيها حالة صحية" بين الشاشتين.
const HEALTH_TYPE_SHORT_LABEL = { chronic: '💊 مزمن', disability: '♿ إعاقة', injury: '🩹 إصابة', needs: '🦽 احتياج' };
const HEALTH_TYPES = Object.keys(HEALTH_FIELD_MAP).map((key) => ({
  key,
  label: HEALTH_TYPE_SHORT_LABEL[key] || HEALTH_FIELD_MAP[key].label,
  fField: HEALTH_FIELD_MAP[key].fField,
  mField: HEALTH_FIELD_MAP[key].mField,
}));

function familyHasHealthType(type, family, members) {
  const def = HEALTH_TYPES.find((h) => h.key === type);
  if (!def) return false;
  if (hasHealthData(family?.[def.fField])) return true;
  return (members || []).some((m) => hasHealthData(m[def.mField]));
}

// حقول تصدير تقرير الاحتياجات القابلة للتخصيص -- الثلاثة عشر حقلاً
// الحالية كلها مفعّلة افتراضياً (كانت كلها إجبارية سابقاً بلا استثناء).
const NEEDS_FIELD_DEFS = [
  { key: 'number', label: '#', order: 1 },
  { key: 'head_name', label: 'اسم رب الأسرة', order: 2 },
  { key: 'head_id', label: 'رقم الهوية', order: 3 },
  { key: 'phone', label: 'الجوال', order: 4 },
  { key: 'camp_name', label: 'المخيم', order: 5 },
  { key: 'member_count', label: 'عدد الأفراد', order: 6 },
  { key: 'categories', label: 'الفئات', order: 7 },
  { key: 'vulnerability', label: 'درجة الضعف', order: 8 },
  { key: 'vuln_score', label: 'نقاط الضعف', order: 9 },
  { key: 'orphans', label: 'الأيتام', order: 10 },
  { key: 'disabilities', label: 'إعاقات', order: 11 },
  { key: 'chronic', label: 'أمراض مزمنة', order: 12 },
  { key: 'elderly', label: 'كبار السن', order: 13 },
];

export default function NeedsReportScreen() {
  const navigation = useNavigation();
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [showBanner, setShowBanner] = useState(true);
  const [bannerLines, setBannerLines] = useState(null);
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterHealth, setFilterHealth] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [needsFields, setNeedsFields] = useState(NEEDS_FIELD_DEFS);

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

  const handleCustomExport = async () => {
    const selected = orderedSelected(needsFields);
    if (!selected.length) return showError('اختر حقلاً واحداً على الأقل');
    try {
      const banner = bannerLines;
      const rows = filtered.map(({ family: f, vuln, cats }, i) => {
        const all = {
          number: i + 1,
          head_name: f.head_name || '',
          head_id: f.head_id || '',
          phone: f.phone1 || '',
          camp_name: campMap[f.camp_id] || '',
          member_count: (memsByFamily[f.id] || []).length + 1,
          categories: cats.filter((c) => c !== 'normal').map((c) => CATEGORY_LABELS[c] || c).join(' | '),
          vulnerability: VULNERABILITY_TIER_LABELS[vuln.tier],
          vuln_score: vuln.score,
          orphans: getOrphanCount(f, memsByFamily[f.id]),
          disabilities: vuln.disabilityCount,
          chronic: vuln.chronicCount,
          elderly: vuln.elderlyCount,
        };
        const row = {};
        selected.forEach((def) => { row[def.label] = all[def.key]; });
        return row;
      });
      const fileName = `تقرير_الاحتياجات_${new Date().toISOString().slice(0, 10)}`;
      await (banner
        ? exportXLSXMultiSheetWithBanners([{ name: 'تقرير الاحتياجات', banner, rows }], fileName)
        : exportXLSX(rows, 'تقرير الاحتياجات', fileName));
      showSuccess('تم تجهيز الملف للمشاركة/الحفظ');
      setFieldPickerOpen(false);
    } catch (e) {
      showError('تعذّر التصدير: ' + e.message);
    }
  };

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
              {VULNERABILITY_TIER_KEYS.map((t) => (
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
              <Pressable style={styles.exportBtn} onPress={() => setFieldPickerOpen(true)}>
                <Text style={styles.exportBtnText}>📤 تصدير التقرير</Text>
              </Pressable>
            </View>

            <CampDelegatePanel
              profile={profile}
              camps={camps}
              filterCamp={filterCamp}
              orgMembers={orgMembers}
              showBanner={showBanner}
              onToggleBanner={setShowBanner}
              onBannerLinesChange={setBannerLines}
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

      <BottomSheetModal visible={fieldPickerOpen} onClose={() => setFieldPickerOpen(false)} title="تخصيص حقول التصدير">
        <FieldPicker title="📋 حقول تقرير الاحتياجات" cols={needsFields} onChange={setNeedsFields} startOpen />
        <Pressable style={styles.customExportBtn} onPress={handleCustomExport}>
          <Text style={styles.customExportBtnText}>📥 تصدير ({orderedSelected(needsFields).length} حقل)</Text>
        </Pressable>
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
    exportBtn: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accent, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 7, minWidth: 40, alignItems: 'center', justifyContent: 'center',
    },
    exportBtnText: { color: colors.accent, fontWeight: 'bold', fontSize: 12 },
    customExportBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
    customExportBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },

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
