import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { hasPermission } from '../../lib/permissions';
import { exportXLSX, exportXLSXMultiSheetWithBanners } from '../../lib/excelIO';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import {
  calcAge, getStageGroup, getGradeDelay, getExpectedGrade, STAGE_ICONS, buildCampExportBanner,
} from '../../lib/helpers';
import PageHeader from '../../components/ui/PageHeader';
import CampDelegatePanel from '../../components/ui/CampDelegatePanel';
import SelectField from '../../components/ui/SelectField';
import EmptyState from '../../components/ui/EmptyState';
import colors from '../../theme/colors';

const ADULT_STAGES = ['دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه'];

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
  const [campFilter, setCampFilter] = useState('');
  const [showBanner, setShowBanner] = useState(true);
  const [stageFilter, setStageFilter] = useState('');
  const [search, setSearch] = useState('');
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) throw new Error('لا يوجد اتصال بالإنترنت');

      const [famRes, campRes, , orgRes] = await withTimeout(
        Promise.all([
          supabase
            .from('families')
            .select('id, camp_id, head_name, head_id, head_dob, head_qualification')
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
      const cached = await getCachedData('education_report', profile?.id);
      if (cached?.data) {
        setFamilies(cached.data.families || []);
        setCamps(cached.data.camps || []);
        setMembers(cached.data.members || []);
        setOrgMembers(cached.data.orgMembers || []);
        setOfflineInfo({ savedAt: cached.savedAt });
      } else {
        console.error('[EducationScreen loadData]', err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, getAllowedCampIds, filterLocal, getVisibleCamps, profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

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
    () => (campFilter ? people.filter((p) => famMap[p.family_id]?.camp_id === campFilter) : people),
    [people, campFilter, famMap]
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

  const handleExport = async () => {
    if (!filtered.length) return;
    const sorted = [...filtered].sort((a, b) => (b.dob || '').localeCompare(a.dob || ''));
    const rows = sorted.map((p) => {
      const f = famMap[p.family_id] || {};
      return {
        'اسم الطالب': p.name || '',
        'رقم الهوية': p.national_id || '',
        'تاريخ الميلاد': p.dob || '',
        'العمر': p.age ?? '',
        'اسم رب الأسرة': f.head_name || '',
        'رقم هوية رب الأسرة': f.head_id || '',
        'المرحلة / المؤهل': p.specificGrade || p.stage || '',
        'متأخر دراسياً': p.delay > 0 ? `نعم (${p.delay} صف)` : 'لا',
      };
    });
    const fileName = stageFilter ? `طلاب_${stageFilter}` : 'طلاب_الكل';
    const banner = campFilter && showBanner ? buildCampExportBanner(camps.find((c) => c.id === campFilter), orgMembers) : null;
    if (banner) {
      await exportXLSXMultiSheetWithBanners([{ name: 'الحالة الدراسية', banner, rows }], fileName);
    } else {
      await exportXLSX(rows, 'الحالة الدراسية', fileName);
    }
  };

  const campOptions = [{ value: '', label: '⛺ كل المخيمات' }, ...camps.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          icon="🎓"
          title="السجل الدراسي"
          subtitle={`${filtered.length} نتيجة${delayedCount ? ` — ⚠️ ${delayedCount} متأخر دراسياً` : ''}`}
        />

        {!!offlineInfo && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>
              📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة
            </Text>
          </View>
        )}

        <SelectField
          value={campOptions.find((o) => o.value === campFilter)?.label}
          placeholder="⛺ كل المخيمات"
          options={campOptions}
          onSelect={setCampFilter}
        />

        <CampDelegatePanel
          camp={camps.find((c) => c.id === campFilter)}
          orgMembers={orgMembers}
          showBanner={showBanner}
          onToggleBanner={setShowBanner}
        />

        <View style={styles.stageGrid}>
          {STAGE_ICONS.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setStageFilter((f) => (f === s.key ? '' : s.key))}
              style={[styles.stageCell, stageFilter === s.key && styles.stageCellActive]}
            >
              <Text style={styles.stageIcon}>{s.icon}</Text>
              <Text style={styles.stageCount}>{stageCounts[s.key] || 0}</Text>
              <Text style={styles.stageLabel}>{s.label}</Text>
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

        {canExport && (
          <Pressable style={styles.exportBtn} onPress={handleExport}>
            <Text style={styles.exportBtnText}>📥 تصدير الطلاب</Text>
          </Pressable>
        )}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🎓" title="لا توجد نتائج" />
        ) : (
          <View style={{ gap: 8, marginTop: 8 }}>
            {filtered.slice(0, 100).map((p) => {
              const f = famMap[p.family_id] || {};
              const stageMeta = STAGE_ICONS.find((s) => s.key === p.stage);
              const isAdult = ADULT_STAGES.includes(p.stage);
              return (
                <Pressable
                  key={p.id}
                  style={styles.personCard}
                  onPress={() => p.family_id && navigation.push('FamilyDetail', { familyId: p.family_id })}
                >
                  <Text style={styles.personName}>{p.name || '—'}</Text>
                  <Text style={styles.personMeta}>
                    {p.age} سنة · {campMap[f.camp_id] || '—'} · 👨‍👩‍👧 {f.head_name || '—'}
                  </Text>
                  {!!p.national_id && <Text style={styles.personId}>🪪 {p.national_id}</Text>}
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
            })}
            {filtered.length > 100 && (
              <Text style={styles.moreText}>عرض 100 من {filtered.length} — استخدم البحث لتضييق النتائج</Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  offlineBanner: {
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 12, padding: 10, marginBottom: 12,
  },
  offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },

  stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  stageCell: {
    width: '23%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingVertical: 10, alignItems: 'center',
  },
  stageCellActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
  stageIcon: { fontSize: 18, marginBottom: 2 },
  stageCount: { color: colors.white, fontWeight: '900', fontSize: 14 },
  stageLabel: { color: colors.muted, fontSize: 9, marginTop: 1 },

  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, marginBottom: 12, textAlign: 'right',
  },
  exportBtn: {
    backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginBottom: 12,
  },
  exportBtnText: { color: colors.green, fontWeight: 'bold', fontSize: 13 },

  personCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 },
  personName: { color: colors.white, fontWeight: '900', fontSize: 13, textAlign: 'right' },
  personMeta: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
  personId: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
  badgeRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeBlue: { backgroundColor: 'rgba(59,130,246,0.15)' },
  badgeGreen: { backgroundColor: 'rgba(16,185,129,0.15)' },
  badgeRed: { backgroundColor: 'rgba(239,68,68,0.15)' },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: 'bold' },
  moreText: { color: colors.muted, fontSize: 11, textAlign: 'center', paddingVertical: 8 },
});
