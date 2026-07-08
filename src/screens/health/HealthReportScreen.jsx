import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { hasPermission } from '../../lib/permissions';
import { exportXLSX } from '../../lib/excelIO';
import {
  parseArr, hasHealthData, arrLabel, calcAge,
  buildFamHasNamedWife, buildFamWithInfant, isAutoNursing,
} from '../../lib/helpers';
import PageHeader from '../../components/ui/PageHeader';
import SelectField from '../../components/ui/SelectField';
import EmptyState from '../../components/ui/EmptyState';
import colors from '../../theme/colors';

const CATEGORIES = [
  { key: 'معاق', label: '🦽 إعاقة', color: colors.purple },
  { key: 'مصاب', label: '🩹 إصابة', color: colors.accent },
  { key: 'مزمن', label: '💊 مرض مزمن', color: '#fb923c' },
  { key: 'حامل', label: '🤰 حمل', color: '#f472b6' },
  { key: 'مرضع', label: '🤱 رضاعة', color: colors.green },
];

export default function HealthReportScreen() {
  const { profile, orgId } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();
  const canExport = hasPermission(profile, 'reports');

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campFilter, setCampFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const allCamps = await fetchCamps(orgId);
      const campIds = getAllowedCampIds(allCamps);
      const allFamilies = await fetchFamilies(orgId);
      const scopedFamilies = filterLocal(allFamilies, campIds);
      const familyIds = scopedFamilies.map((f) => f.id);
      const mems = await fetchFamilyMembers(familyIds);
      setFamilies(scopedFamilies);
      setCamps(getVisibleCamps(allCamps));
      setMembers(mems);
    } catch (err) {
      console.error('[HealthReportScreen loadData]', err.message);
    } finally {
      setLoading(false);
    }
  }, [orgId, getAllowedCampIds, filterLocal, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);
  const famMap = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f])), [families]);

  const allPersons = useMemo(() => {
    const list = [];
    families.forEach((f) => {
      const fMems = members.filter((m) => m.family_id === f.id);
      const headInMems = fMems.some(
        (m) =>
          (f.head_id && m.national_id && m.national_id.trim() === f.head_id.trim()) ||
          ['رب الأسرة', 'رب أسرة', 'head'].includes((m.relation || '').trim())
      );
      if (!headInMems) {
        list.push({
          id: f.id + '_head', isHead: true, family_id: f.id,
          name: f.head_name, national_id: f.head_id, dob: f.head_dob,
          age: calcAge(f.head_dob), gender: f.head_gender, relation: 'رب الأسرة',
          disabilities: f.head_disabilities, injuries: f.head_injuries,
          chronic: f.head_chronic_diseases, female_status: f.head_female_status,
        });
      }
    });
    members.forEach((m) => {
      list.push({
        id: m.id, isHead: false, family_id: m.family_id,
        name: m.name, national_id: m.national_id, dob: m.dob,
        age: calcAge(m.dob), gender: m.gender, relation: m.relation,
        disabilities: m.disabilities, injuries: m.injuries,
        chronic: m.chronic_diseases, female_status: m.female_status,
      });
    });
    return list;
  }, [families, members]);

  const famHasNamedWife = useMemo(() => buildFamHasNamedWife(members), [members]);
  const famWithInfant = useMemo(() => buildFamWithInfant(members, families), [members, families]);

  const isPregnant = (p) => {
    if (['ذكر', 'male'].includes(p.gender)) return false;
    return parseArr(p.female_status).includes('حامل');
  };
  const isNursing = (p) => {
    if (['ذكر', 'male'].includes(p.gender)) return false;
    if (parseArr(p.female_status).includes('مرضع')) return true;
    return isAutoNursing(p, famHasNamedWife, famWithInfant);
  };

  const scoped = useMemo(
    () => (campFilter ? allPersons.filter((p) => famMap[p.family_id]?.camp_id === campFilter) : allPersons),
    [allPersons, campFilter, famMap]
  );

  const groups = useMemo(
    () => ({
      معاق: scoped.filter((p) => hasHealthData(p.disabilities)),
      مصاب: scoped.filter((p) => hasHealthData(p.injuries)),
      مزمن: scoped.filter((p) => hasHealthData(p.chronic)),
      حامل: scoped.filter(isPregnant),
      مرضع: scoped.filter(isNursing),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, famHasNamedWife, famWithInfant]
  );

  const filtered = useMemo(() => {
    if (catFilter) return groups[catFilter] || [];
    const seen = new Set();
    const out = [];
    Object.values(groups).flat().forEach((p) => {
      const key = p.family_id + '_' + p.id;
      if (!seen.has(key)) { seen.add(key); out.push(p); }
    });
    return out;
  }, [groups, catFilter]);

  const exportReport = async (type) => {
    const sourceMap = { all: filtered, disabled: groups['معاق'], injured: groups['مصاب'], chronic: groups['مزمن'] };
    const source = sourceMap[type] || [];
    if (!source.length) return;
    const rows = source.map((p) => {
      const f = famMap[p.family_id] || {};
      const row = {
        'الاسم': p.name || '', 'رقم الهوية': p.national_id || '', 'الجنس': p.gender || '',
        'تاريخ الميلاد': p.dob || '', 'العمر': p.age ?? '', 'صلة القرابة': p.relation || '',
        'اسم رب الأسرة': f.head_name || '', 'هوية رب الأسرة': f.head_id || '',
        'الجوال': f.phone1 || '', 'المخيم': campMap[f.camp_id] || '', 'رقم الخيمة': f.tent || '',
      };
      if (type === 'disabled') row['نوع الإعاقة'] = arrLabel(p.disabilities);
      if (type === 'injured') row['نوع الإصابة'] = arrLabel(p.injuries);
      if (type === 'chronic') row['الأمراض المزمنة'] = arrLabel(p.chronic);
      return row;
    });
    const sheetNames = { all: 'كشف شامل', disabled: 'إعاقات', injured: 'إصابات', chronic: 'أمراض مزمنة' };
    const fileNames = { all: 'كشف_صحي_شامل', disabled: 'كشف_الإعاقات', injured: 'كشف_الإصابات', chronic: 'كشف_الأمراض_المزمنة' };
    await exportXLSX(rows, sheetNames[type], fileNames[type]);
  };

  const campOptions = [{ value: '', label: '⛺ كل المخيمات' }, ...camps.map((c) => ({ value: c.id, label: c.name }))];
  const catOptions = [{ value: '', label: 'كل الحالات الصحية' }, ...CATEGORIES.map((c) => ({ value: c.key, label: c.label }))];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader icon="⚕️" title="كشف الحالات الصحية" subtitle={`${filtered.length} حالة${catFilter ? ' — ' + catFilter : ''}`} />

        {canExport && (
          <View style={styles.exportRow}>
            <Pressable style={styles.expAccent} onPress={() => exportReport('all')}>
              <Text style={styles.expAccentText}>📤 شامل</Text>
            </Pressable>
            <Pressable style={styles.expPurple} onPress={() => exportReport('disabled')}>
              <Text style={styles.expPurpleText}>🦽 إعاقات</Text>
            </Pressable>
            <Pressable style={styles.expOrange} onPress={() => exportReport('injured')}>
              <Text style={styles.expOrangeText}>🩹 إصابات</Text>
            </Pressable>
            <Pressable style={styles.expOrange} onPress={() => exportReport('chronic')}>
              <Text style={styles.expOrangeText}>💊 مزمن</Text>
            </Pressable>
          </View>
        )}

        <SelectField
          value={campOptions.find((o) => o.value === campFilter)?.label}
          placeholder="⛺ كل المخيمات"
          options={campOptions}
          onSelect={setCampFilter}
        />
        <SelectField
          value={catOptions.find((o) => o.value === catFilter)?.label}
          placeholder="كل الحالات الصحية"
          options={catOptions}
          onSelect={setCatFilter}
        />

        <View style={styles.statGrid}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => setCatFilter((f) => (f === c.key ? '' : c.key))}
              style={[styles.statBox, catFilter === c.key && styles.statBoxActive]}
            >
              <Text style={[styles.statValue, { color: c.color }]}>{groups[c.key]?.length || 0}</Text>
              <Text style={styles.statLabel}>{c.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setCatFilter('')} style={[styles.statBox, !catFilter && styles.statBoxActive]}>
            <Text style={[styles.statValue, { color: colors.blue }]}>{filtered.length}</Text>
            <Text style={styles.statLabel}>👥 الكل</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="✅" title="لا توجد حالات صحية مسجّلة بهذه المعايير" />
        ) : (
          <View style={{ gap: 8, marginTop: 8 }}>
            {filtered.map((p) => {
              const f = famMap[p.family_id] || {};
              const disStr = arrLabel(p.disabilities);
              const injStr = arrLabel(p.injuries);
              const chrStr = arrLabel(p.chronic);
              const pregnant = isPregnant(p);
              const nursing = isNursing(p);
              return (
                <View key={p.id} style={styles.personCard}>
                  <Text style={styles.personName}>{p.name || '—'}</Text>
                  <Text style={styles.personMeta}>
                    {p.relation || '—'} · {campMap[f.camp_id] || '—'} {p.age != null ? `· ${p.age} سنة` : ''}
                  </Text>
                  {!!p.national_id && <Text style={styles.personId}>🪪 {p.national_id}</Text>}
                  <Text style={styles.personMeta}>👨‍👩‍👧 {f.head_name || '—'} · 📞 {f.phone1 || '—'}</Text>
                  {(disStr || injStr || chrStr || pregnant || nursing) && (
                    <View style={styles.badgeRow}>
                      {!!disStr && <View style={[styles.badge, { backgroundColor: 'rgba(139,92,246,0.2)' }]}><Text style={[styles.badgeText, { color: colors.purple }]}>🦽 {disStr}</Text></View>}
                      {!!injStr && <View style={[styles.badge, { backgroundColor: 'rgba(245,158,11,0.2)' }]}><Text style={[styles.badgeText, { color: colors.accent }]}>🩹 {injStr}</Text></View>}
                      {!!chrStr && <View style={[styles.badge, { backgroundColor: 'rgba(251,146,60,0.2)' }]}><Text style={[styles.badgeText, { color: '#fb923c' }]}>💊 {chrStr}</Text></View>}
                      {pregnant && <View style={[styles.badge, { backgroundColor: 'rgba(244,114,182,0.2)' }]}><Text style={[styles.badgeText, { color: '#f472b6' }]}>🤰 حامل</Text></View>}
                      {nursing && <View style={[styles.badge, { backgroundColor: 'rgba(16,185,129,0.2)' }]}><Text style={[styles.badgeText, { color: colors.green }]}>🤱 مرضع</Text></View>}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  expAccent: { flexGrow: 1, backgroundColor: colors.accent, paddingVertical: 10, borderRadius: 12, alignItems: 'center', minWidth: 70 },
  expAccentText: { color: colors.bg, fontWeight: '900', fontSize: 11 },
  expPurple: { flexGrow: 1, backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1, borderColor: colors.purple, paddingVertical: 10, borderRadius: 12, alignItems: 'center', minWidth: 70 },
  expPurpleText: { color: colors.purple, fontWeight: 'bold', fontSize: 11 },
  expOrange: { flexGrow: 1, backgroundColor: 'rgba(251,146,60,0.1)', borderWidth: 1, borderColor: '#fb923c', paddingVertical: 10, borderRadius: 12, alignItems: 'center', minWidth: 70 },
  expOrangeText: { color: '#fb923c', fontWeight: 'bold', fontSize: 11 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 8 },
  statBox: { width: '31%', backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'transparent', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  statBoxActive: { borderColor: colors.accent },
  statValue: { fontWeight: '900', fontSize: 16 },
  statLabel: { color: colors.muted, fontSize: 9, marginTop: 2, textAlign: 'center' },

  personCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 },
  personName: { color: colors.white, fontWeight: '900', fontSize: 13, textAlign: 'right' },
  personMeta: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
  personId: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
  badgeRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
});
