import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { hasPermission } from '../../lib/permissions';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { showError, showSuccess } from '../../utils/toast';
import { exportXLSX, exportXLSXMultiSheetWithBanners } from '../../lib/excelIO';
import { formatDateTime } from '../../lib/utils';
import {
  calcAge, getStageGroup, getGradeDelay, getExpectedGrade, STAGE_ICONS, buildCampExportBanner, naturalCompare,
} from '../../lib/helpers';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FieldPicker, { orderedSelected } from '../../components/ui/FieldPicker';
import CampDelegatePanel from '../../components/ui/CampDelegatePanel';
import colors from '../../theme/colors';

const ADULT_STAGES = ['دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه'];

// حقول تصدير كشف الحالة الدراسية القابلة للتخصيص -- الثمانية الحالية
// مفعّلة افتراضياً بنفس الترتيب والقيم السابقة، وثلاثة حقول اختيارية
// إضافية (جوال رب الأسرة، المخيم، رقم الخيمة) لمن يحتاجها.
const EDU_FIELD_DEFS = [
  { key: 'name', label: 'اسم الطالب', order: 1 },
  { key: 'national_id', label: 'رقم الهوية', order: 2 },
  { key: 'dob', label: 'تاريخ الميلاد', order: 3 },
  { key: 'age', label: 'العمر', order: 4 },
  { key: 'head_name', label: 'اسم رب الأسرة', order: 5 },
  { key: 'head_id', label: 'رقم هوية رب الأسرة', order: 6 },
  { key: 'grade', label: 'المرحلة / المؤهل', order: 7 },
  { key: 'delay', label: 'متأخر دراسياً', order: 8 },
  { key: 'head_phone', label: 'رقم جوال رب الأسرة', order: 0 },
  { key: 'camp_name', label: 'المخيم', order: 0 },
  { key: 'tent', label: 'رقم الخيمة', order: 0 },
];

export default function EducationScreen() {
  const navigation = useNavigation();
  const { profile, orgId } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();
  const canExport = hasPermission(profile, 'reports');

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [stageFilter, setStageFilter] = useState('');
  const [search, setSearch] = useState('');
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [eduFields, setEduFields] = useState(EDU_FIELD_DEFS);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const cached = await getCachedData('education_report', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      setFamilies(cached.data.families || []);
      setCamps(cached.data.camps || []);
      setMembers(cached.data.members || []);
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

      const [famRes, campRes, , orgRes] = await withTimeout(
        Promise.all([
          supabase
            .from('families')
            .select('id, camp_id, head_name, head_id, head_dob, head_qualification, tent')
            .eq('org_id', orgId)
            .eq('_deleted', false),
          supabase.from('camps').select('*').eq('org_id', orgId),
          null, // يُعبَّأ لاحقاً بعد معرفة معرّفات الأسر
          supabase.from('org_members').select('*').eq('org_id', orgId),
        ]),
        12000,
        'انتهت مهلة تحميل البيانات'
      );

      const allCamps = campRes.data || [];
      const campIds = getAllowedCampIds(allCamps);
      const scopedFamilies = filterLocal(famRes.data || [], campIds);
      const familyIds = scopedFamilies.map((f) => f.id);

      const memResFinal = familyIds.length
        ? await withTimeout(
            supabase
              .from('family_members')
              .select('id, family_id, name, national_id, dob, relation, qualification, actual_grade')
              .in('family_id', familyIds)
              .eq('_deleted', false),
            12000,
            'انتهت مهلة تحميل البيانات'
          )
        : { data: [] };

      const visibleCamps = getVisibleCamps(allCamps);
      const finalMembers = memResFinal.data || [];
      const finalOrgMembers = orgRes.data || [];

      setFamilies(scopedFamilies);
      setCamps(visibleCamps);
      setMembers(finalMembers);
      setOrgMembers(finalOrgMembers);
      setOfflineInfo(null);
      cacheData('education_report', profile?.id, {
        families: scopedFamilies, camps: visibleCamps, members: finalMembers, orgMembers: finalOrgMembers,
      });
    } catch (err) {
      if (!hadCache) showError('تعذّر تحميل السجل ولا توجد نسخة محفوظة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, filterLocal, getVisibleCamps, profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);
  const famMap = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f])), [families]);

  const people = useMemo(() => {
    const list = [];
    families.forEach((f) => {
      const age = calcAge(f.head_dob);
      const stage = age != null && age >= 18 ? (f.head_qualification || null) : getStageGroup(age);
      if (stage) {
        list.push({
          id: f.id + '_head', family_id: f.id, name: f.head_name, national_id: f.head_id,
          age, dob: f.head_dob, stage, specificGrade: null, delay: 0,
        });
      }
    });
    members.forEach((m) => {
      const age = calcAge(m.dob);
      const isAdult = age != null && age >= 18;
      const stage = isAdult ? (m.qualification || null) : getStageGroup(age);
      if (stage) {
        list.push({
          id: m.id, family_id: m.family_id, name: m.name, national_id: m.national_id,
          age, dob: m.dob, stage,
          specificGrade: isAdult ? null : (m.actual_grade || getExpectedGrade(age)),
          delay: getGradeDelay(age, m.actual_grade),
        });
      }
    });
    return list;
  }, [families, members]);

  const scoped = useMemo(
    () => (filterCamp ? people.filter((p) => famMap[p.family_id]?.camp_id === filterCamp) : people),
    [people, filterCamp, famMap]
  );

  const stageCounts = useMemo(() => {
    const c = {};
    STAGE_ICONS.forEach((s) => { c[s.key] = scoped.filter((p) => p.stage === s.key).length; });
    return c;
  }, [scoped]);

  const delayedCount = useMemo(() => scoped.filter((p) => p.delay > 0).length, [scoped]);
  const byStage = useMemo(() => (stageFilter ? scoped.filter((p) => p.stage === stageFilter) : scoped), [scoped, stageFilter]);
  const filtered = useMemo(() => {
    if (!search.trim()) return byStage;
    const q = search.trim().toLowerCase();
    return byStage.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.national_id || '').includes(q));
  }, [byStage, search]);

  const handleCustomExport = async () => {
    const selected = orderedSelected(eduFields);
    if (!selected.length) return showError('اختر حقلاً واحداً على الأقل');
    try {
      const banner = filterCamp && showBanner ? buildCampExportBanner(camps.find((c) => c.id === filterCamp), orgMembers) : null;
      const sorted = [...filtered].sort((a, b) => naturalCompare(a.name, b.name));
      const rows = sorted.map((p) => {
        const f = famMap[p.family_id] || {};
        const all = {
          name: p.name || '',
          national_id: p.national_id || '',
          dob: p.dob || '',
          age: p.age ?? '',
          head_name: f.head_name || '',
          head_id: f.head_id || '',
          grade: p.specificGrade || p.stage || '',
          delay: p.delay > 0 ? `نعم (${p.delay} صف)` : 'لا',
          head_phone: f.phone1 || '',
          camp_name: campMap[f.camp_id] || '',
          tent: f.tent || '',
        };
        const row = {};
        selected.forEach((def) => { row[def.label] = all[def.key]; });
        return row;
      });
      const fileName = stageFilter ? `طلاب_${stageFilter}` : 'طلاب_الكل';
      await (banner
        ? exportXLSXMultiSheetWithBanners([{ name: 'الحالة الدراسية', banner, rows }], fileName)
        : exportXLSX(rows, 'الحالة الدراسية', fileName));
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

  const renderPerson = ({ item: p }) => {
    const f = famMap[p.family_id] || {};
    const stageMeta = STAGE_ICONS.find((s) => s.key === p.stage);
    const isAdult = ADULT_STAGES.includes(p.stage);
    return (
      <Pressable style={styles.card} onPress={() => p.family_id && navigation.push('FamilyDetail', { familyId: p.family_id })}>
        <Text style={styles.cardName}>{p.name || '—'} <Text style={styles.ageTag}>({p.age})</Text></Text>
        <Text style={styles.cardMeta}>{campMap[f.camp_id] || '—'} • 👨‍👩‍👧 {f.head_name || '—'}</Text>
        {!!p.national_id && <Text style={styles.cardSubMeta}>🪪 {p.national_id}</Text>}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, isAdult ? styles.badgeGreen : styles.badgeBlue]}>
            <Text style={styles.badgeText}>{stageMeta?.icon} {p.specificGrade || p.stage}</Text>
          </View>
          {p.delay > 0 && (
            <View style={[styles.badge, styles.badgeRed]}>
              <Text style={styles.badgeText}>⚠️ متأخر {p.delay} صف</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={filtered.slice(0, 100)}
        keyExtractor={(item) => item.id}
        renderItem={renderPerson}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="🎓"
              title="السجل الدراسي"
              subtitle={
                <Text style={styles.headerSubtitle}>
                  {filtered.length} نتيجة{delayedCount ? ` — ⚠️ ${delayedCount} متأخر دراسياً` : ''}
                </Text>
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
              {canExport && (
                <Pressable style={styles.exportBtn} onPress={() => setFieldPickerOpen(true)}>
                  <Text style={styles.exportBtnText}>📤 تصدير الكشف</Text>
                </Pressable>
              )}
            </View>

            <CampDelegatePanel
              camp={camps.find((c) => c.id === filterCamp)}
              orgMembers={orgMembers}
              showBanner={showBanner}
              onToggleBanner={setShowBanner}
            />

            <View style={styles.ageGrid}>
              {STAGE_ICONS.map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => setStageFilter((f) => (f === s.key ? '' : s.key))}
                  style={[styles.ageBox, stageFilter === s.key && styles.ageBoxActive]}
                >
                  <Text style={styles.ageIcon}>{s.icon}</Text>
                  <Text style={[styles.ageCount, stageFilter === s.key && styles.ageCountActive]}>{stageCounts[s.key] || 0}</Text>
                  <Text style={styles.ageLabel}>{s.label}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث بالاسم أو رقم الهوية..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <Text style={styles.countText}>
              {filterCamp ? `مجموع الطلاب بـ${campMap[filterCamp]}: ` : 'مجموع الطلاب: '}
              <Text style={styles.countValue}>{filtered.length}</Text>
            </Text>

            {filtered.length > 100 && (
              <Text style={styles.moreText}>عرض 100 من {filtered.length} — استخدم البحث لتضييق النتائج</Text>
            )}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="🎓" title="لا توجد نتائج" />}
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
        <FieldPicker title="📋 حقول كشف الحالة الدراسية" cols={eduFields} onChange={setEduFields} startOpen />
        <Pressable style={styles.customExportBtn} onPress={handleCustomExport}>
          <Text style={styles.customExportBtnText}>📥 تصدير ({orderedSelected(eduFields).length} حقل)</Text>
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
    headerSubtitle: { color: colors.muted, fontSize: 11, textAlign: 'center' },
    offlineBanner: {
      backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
      borderRadius: 12, padding: 10, marginBottom: 12,
    },
    offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 },
    exportBtn: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accent, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 7, minWidth: 40, alignItems: 'center', justifyContent: 'center',
    },
    exportBtnText: { color: colors.accent, fontWeight: 'bold', fontSize: 12 },
    customExportBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
    customExportBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },

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
    cardSubMeta: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
    badgeRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    badgeBlue: { backgroundColor: 'rgba(59,130,246,0.15)' },
    badgeGreen: { backgroundColor: 'rgba(16,185,129,0.15)' },
    badgeRed: { backgroundColor: 'rgba(239,68,68,0.15)' },
    badgeText: { color: colors.white, fontSize: 10, fontWeight: 'bold' },
    moreText: { color: colors.muted, fontSize: 11, textAlign: 'center', paddingVertical: 8 },

    campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
  });
