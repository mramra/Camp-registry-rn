import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { checkFamilyIssues, isIncomplete, hasMissingDob } from '../../lib/helpers';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

// فُصلت هذه الشاشة عن "كل الأسر" (طلب مباشر) لتقليل عدد الفلاتر بالصفحة
// الرئيسية -- "الأشد ضعفاً" اتشالت من هذا الفلتر لأنها مغطاة بالكامل
// بشاشة "تقرير الاحتياجات" (مكانها الطبيعي)، فبقي هون بس فلاتر جودة
// البيانات الفعلية: نواقص وتكرارات.
const ISSUE_OPTIONS = [
  { key: '', icon: '👥', label: 'الكل' },
  { key: 'incomplete', icon: '⚠️', label: 'ناقص' },
  { key: 'dob', icon: '🎂', label: 'تاريخ ميلاد ناقص' },
  { key: 'dup_id', icon: '🔁', label: 'هوية مكررة' },
  { key: 'dup_phone', icon: '📞', label: 'جوال مكرر' },
];

export default function DataQualityScreen() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const { orgId } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [filterCamp, setFilterCamp] = useState('');
  const [filterIssue, setFilterIssue] = useState('incomplete');

  const loadData = useCallback(async () => {
    if (!orgId) return;
    const cached = await getCachedData('data_quality', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      setFamilies(cached.data.families || []);
      setAllMembers(cached.data.members || []);
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

      setFamilies(fams);
      setAllMembers(mems);
      setCamps(visibleCamps);
      setOfflineInfo(null);
      cacheData('data_quality', profile?.id, { families: fams, members: mems, camps: visibleCamps });
    } catch (e) {
      if (!hadCache) showError('تعذّر تحميل البيانات ولا توجد نسخة محفوظة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);
  const membersByFamily = useMemo(() => {
    const map = {};
    allMembers.forEach((m) => { (map[m.family_id] ||= []).push(m); });
    return map;
  }, [allMembers]);

  // ── كشف التكرار (هوية/جوال) — نفس منطق شاشة كل الأسر حرفياً ──
  const { dupIdSet, dupPhoneSet } = useMemo(() => {
    const idOwners = {};
    families.forEach((f) => {
      if (!f.head_id) return;
      if (!idOwners[f.head_id]) idOwners[f.head_id] = new Set();
      idOwners[f.head_id].add(f.id);
    });
    allMembers.forEach((m) => {
      if (!m.national_id) return;
      if (!idOwners[m.national_id]) idOwners[m.national_id] = new Set();
      idOwners[m.national_id].add(m.family_id);
    });
    const dupIdSet = new Set(families.filter((f) => (idOwners[f.head_id]?.size || 0) > 1).map((f) => f.id));

    const cleanPhone = (p) => (p || '').replace(/\s/g, '');
    const phoneCounts = {};
    families.forEach((f) => {
      if (!f.phone1) return;
      const p = cleanPhone(f.phone1);
      phoneCounts[p] = (phoneCounts[p] || 0) + 1;
    });
    const dupPhoneSet = new Set(families.filter((f) => f.phone1 && phoneCounts[cleanPhone(f.phone1)] > 1).map((f) => f.id));

    return { dupIdSet, dupPhoneSet };
  }, [families, allMembers]);

  const counts = useMemo(() => {
    const base = filterCamp ? families.filter((f) => f.camp_id === filterCamp) : families;
    return {
      all: base.length,
      incomplete: base.filter((f) => isIncomplete(f, membersByFamily[f.id])).length,
      dob: base.filter((f) => hasMissingDob(f, membersByFamily[f.id])).length,
      dup_id: base.filter((f) => dupIdSet.has(f.id)).length,
      dup_phone: base.filter((f) => dupPhoneSet.has(f.id)).length,
    };
  }, [families, filterCamp, membersByFamily, dupIdSet, dupPhoneSet]);

  const filtered = useMemo(() => {
    let list = families.filter(
      (f) => isIncomplete(f, membersByFamily[f.id]) || hasMissingDob(f, membersByFamily[f.id]) || dupIdSet.has(f.id) || dupPhoneSet.has(f.id)
    );
    if (filterCamp) list = list.filter((f) => f.camp_id === filterCamp);
    if (filterIssue === 'incomplete') list = list.filter((f) => isIncomplete(f, membersByFamily[f.id]));
    else if (filterIssue === 'dob') list = list.filter((f) => hasMissingDob(f, membersByFamily[f.id]));
    else if (filterIssue === 'dup_id') list = list.filter((f) => dupIdSet.has(f.id));
    else if (filterIssue === 'dup_phone') list = list.filter((f) => dupPhoneSet.has(f.id));

    return list.sort(
      (a, b) => checkFamilyIssues(b, membersByFamily[b.id]).length - checkFamilyIssues(a, membersByFamily[a.id]).length
    );
  }, [families, membersByFamily, dupIdSet, dupPhoneSet, filterCamp, filterIssue]);

  const styles = getStyles();

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}><ActivityIndicator size="large" color={colors.accent} /></View>
      </SafeAreaView>
    );
  }

  const renderRow = ({ item: f }) => {
    const issues = checkFamilyIssues(f, membersByFamily[f.id]);
    const isDupId = dupIdSet.has(f.id);
    const isDupPhone = dupPhoneSet.has(f.id);
    const missingDob = hasMissingDob(f, membersByFamily[f.id]);
    const barColor = isDupId ? colors.purple : isDupPhone ? colors.blue : colors.red;
    return (
      <Pressable style={styles.card} onPress={() => navigation.push('FamilyDetail', { familyId: f.id })}>
        <View style={[styles.sideBar, { backgroundColor: barColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{f.head_name || '(بدون اسم)'}</Text>
          <Text style={styles.cardMeta}>
            {f.head_id || '—'}{campMap[f.camp_id] ? ` · 🏕️ ${campMap[f.camp_id]}` : ''}
          </Text>
          <View style={styles.tagsRow}>
            {isDupId && <Text style={styles.tagDupId}>🔁 هوية مكررة</Text>}
            {isDupPhone && <Text style={styles.tagDupPhone}>📞 جوال مكرر</Text>}
            {missingDob && <Text style={styles.tagDob}>🎂 تاريخ ميلاد ناقص</Text>}
            {issues.length > 0 && <Text style={styles.tagIncomplete}>⚠️ {issues.length} نقص</Text>}
          </View>
          {issues.length > 0 && (
            <Text style={styles.issuesText} numberOfLines={2}>{issues.join(' · ')}</Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(f) => f.id}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader icon="🔍" title="جودة البيانات" subtitle={`${filtered.length} أسرة بحاجة مراجعة`} />
            {!!offlineInfo && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}
                </Text>
              </View>
            )}
            <View style={styles.statsGrid}>
              {ISSUE_OPTIONS.map((o) => (
                <Pressable
                  key={o.key || 'all'}
                  onPress={() => setFilterIssue(o.key)}
                  style={[styles.statBox, filterIssue === o.key && styles.statBoxActive]}
                >
                  <Text style={styles.statIcon}>{o.icon}</Text>
                  <Text style={styles.statCount}>{o.key ? counts[o.key] : counts.all}</Text>
                  <Text style={styles.statLabel}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
            <SelectField
              wheel
              label="المخيم"
              value={filterCamp ? campMap[filterCamp] : 'كل المخيمات'}
              options={[{ value: '', label: 'كل المخيمات' }, ...camps.map((c) => ({ value: c.id, label: c.name }))]}
              onSelect={setFilterCamp}
              placeholder="كل المخيمات"
            />
            {filterIssue === 'dob' && filtered.length > 0 && (
              <Pressable
                style={styles.smsBtn}
                onPress={() =>
                  navigation.navigate('SMS', {
                    preselectFamilyIds: filtered.map((f) => f.id),
                    presetMessage:
                      'السلام عليكم، برجاء استكمال تاريخ الميلاد الناقص لأفراد أسرتكم عبر بوابة الأسرة (رابط التطبيق) — يساعدنا هذا بخدمتكم بشكل أفضل. شكراً لتعاونكم.',
                  })
                }
              >
                <Text style={styles.smsBtnText}>📩 إرسال رسالة لهذه الأسر ({filtered.length})</Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="✅" title="لا توجد مشاكل بيانات" subtitle="كل الأسر بهذا الفلتر مكتملة وغير مكررة" />}
      />
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

    statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    statBox: {
      flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingVertical: 10, alignItems: 'center',
    },
    statBoxActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
    statIcon: { fontSize: 16 },
    statCount: { color: colors.white, fontWeight: '900', fontSize: 15, marginTop: 2 },
    statLabel: { color: colors.muted, fontSize: 9, marginTop: 2, textAlign: 'center' },



    card: { flexDirection: 'row-reverse', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
    sideBar: { width: 5 },
    cardName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right', padding: 12, paddingBottom: 0 },
    cardMeta: { color: colors.muted, fontSize: 11, textAlign: 'right', paddingHorizontal: 12, marginTop: 2 },
    tagsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, marginTop: 6 },
    tagDupId: { color: colors.purple, fontSize: 10, fontWeight: 'bold' },
    tagDupPhone: { color: colors.blue, fontSize: 10, fontWeight: 'bold' },
    tagDob: { color: colors.accent, fontSize: 10, fontWeight: 'bold' },
    smsBtn: {
      backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: colors.accent,
      borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12,
    },
    smsBtnText: { color: colors.accent, fontWeight: '900', fontSize: 13 },
    tagIncomplete: { color: colors.red, fontSize: 10, fontWeight: 'bold' },
    issuesText: { color: colors.muted, fontSize: 10, textAlign: 'right', paddingHorizontal: 12, paddingBottom: 12, marginTop: 4, lineHeight: 15 },
  });
