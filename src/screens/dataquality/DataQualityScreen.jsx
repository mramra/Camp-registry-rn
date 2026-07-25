import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { checkFamilyIssues, hasMissingDob } from '../../lib/helpers';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

/**
 * "نواقص وتكررات" (كانت "جودة البيانات") -- بدل شبكة أيقونات ثابتة
 * بـ5 فئات عامة بس، صار فلترة تفصيلية بحقلين: مخيم + نوع بيان محدَّد
 * (كل حقل من checkFamilyIssues المركزية له خيار مستقل هون)، عشان تقدر
 * تسأل بالضبط "مين بمخيم كذا ناقص اسمه رباعي" بدون ما تفلتر يدوياً.
 *
 * كل نوع بيان معرَّف بدالة match(f, issues) ترجع true/false -- تُطبَّق
 * على قائمة الأسر مع فلتر المخيم المختار. الأنواع الخاصة (تاريخ الميلاد،
 * التكرارات) لها معالجة مستقلة بمنطقها الأصلي (hasMissingDob/dupSets).
 */
const DATA_TYPE_OPTIONS = [
  { key: '', label: '— كل النواقص والتكررات —', match: null },
  { key: 'name4', label: '👤 الاسم غير رباعي', match: (f, issues) => issues.includes('اسم رب الأسرة ناقص') || issues.includes('الاسم غير رباعي') },
  { key: 'head_id', label: '🆔 رقم الهوية (ناقص/غير صحيح)', match: (f, issues) => issues.includes('رقم الهوية ناقص') || issues.includes('رقم الهوية غير صحيح') },
  { key: 'phone1', label: '📱 رقم الجوال', match: (f, issues) => issues.includes('رقم الجوال ناقص') },
  { key: 'phone2', label: '💬 رقم واتساب', match: (f, issues) => issues.includes('رقم واتساب ناقص') },
  { key: 'whatsapp_prefix', label: '🔢 مقدمة الواتساب', match: (f, issues) => issues.includes('مقدمة الواتساب ناقصة') },
  { key: 'wallet_type', label: '💳 نوع المحفظة الإلكترونية', match: (f, issues) => issues.includes('نوع المحفظة الإلكترونية ناقص') },
  { key: 'wallet_phone', label: '💳 رقم المحفظة الإلكترونية', match: (f, issues) => issues.includes('رقم المحفظة الإلكترونية ناقص') },
  { key: 'dob', label: '🎂 تاريخ الميلاد (رب الأسرة أو أي فرد)', match: null },
  { key: 'marital', label: '💍 الحالة الاجتماعية', match: (f, issues) => issues.includes('الحالة الاجتماعية ناقصة') },
  { key: 'camp', label: '🏕️ المخيم', match: (f, issues) => issues.includes('المخيم ناقص') },
  { key: 'original_address', label: '🗺️ المحافظة الأصلية', match: (f, issues) => issues.includes('المحافظة الأصلية ناقصة') },
  { key: 'governorate_current', label: '📍 محافظة السكن الحالي', match: (f, issues) => issues.includes('محافظة السكن الحالي ناقصة') },
  { key: 'spouse', label: '👰 بيانات الزوجة (لمتزوج)', match: (f, issues) => issues.includes('بيانات الزوجة ناقصة') },
  { key: 'member_name', label: '👥 اسم فرد فارغ/قصير', match: (f, issues) => issues.some((i) => i === 'اسم فرد فارغ' || i.includes('قصير جداً')) },
  { key: 'dup_id', label: '🔁 هوية مكررة', match: null },
  { key: 'dup_phone', label: '📞 جوال مكرر', match: null },
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
  const [filterType, setFilterType] = useState('');

  const loadData = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
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

  const matchesType = useCallback((f, key) => {
    if (!key) {
      const issues = checkFamilyIssues(f, membersByFamily[f.id]);
      return issues.length > 0 || hasMissingDob(f, membersByFamily[f.id]) || dupIdSet.has(f.id) || dupPhoneSet.has(f.id);
    }
    if (key === 'dob') return hasMissingDob(f, membersByFamily[f.id]);
    if (key === 'dup_id') return dupIdSet.has(f.id);
    if (key === 'dup_phone') return dupPhoneSet.has(f.id);
    const opt = DATA_TYPE_OPTIONS.find((o) => o.key === key);
    if (!opt?.match) return false;
    const issues = checkFamilyIssues(f, membersByFamily[f.id]);
    return opt.match(f, issues);
  }, [membersByFamily, dupIdSet, dupPhoneSet]);

  const filtered = useMemo(() => {
    let list = families.filter((f) => matchesType(f, filterType));
    if (filterCamp) list = list.filter((f) => f.camp_id === filterCamp);
    return list.sort(
      (a, b) => checkFamilyIssues(b, membersByFamily[b.id]).length - checkFamilyIssues(a, membersByFamily[a.id]).length
    );
  }, [families, filterCamp, filterType, matchesType, membersByFamily]);

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
            <PageHeader icon="🔍" title="نواقص وتكررات" subtitle={`${filtered.length} أسرة بحاجة مراجعة`} />
            {!!offlineInfo && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}
                </Text>
              </View>
            )}
            <SelectField
              label="المخيم"
              value={filterCamp ? campMap[filterCamp] : 'كل المخيمات'}
              options={[{ value: '', label: 'كل المخيمات' }, ...camps.map((c) => ({ value: c.id, label: c.name }))]}
              onSelect={setFilterCamp}
              placeholder="كل المخيمات"
            />
            <SelectField
              label="نوع البيان الناقص/المكرر"
              value={DATA_TYPE_OPTIONS.find((o) => o.key === filterType)?.label}
              options={DATA_TYPE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
              onSelect={setFilterType}
              placeholder="— كل النواقص والتكررات —"
            />
            {filtered.length > 0 && (
              <Pressable
                style={styles.smsBtn}
                onPress={() =>
                  navigation.navigate('SMS', {
                    preselectFamilyIds: filtered.map((f) => f.id),
                    presetMessage:
                      'السلام عليكم، برجاء استكمال بياناتكم الناقصة عبر بوابة الأسرة (رابط التطبيق) أو التواصل معنا — يساعدنا هذا بخدمتكم بشكل أفضل. شكراً لتعاونكم.',
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
      borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4, marginBottom: 12,
    },
    smsBtnText: { color: colors.accent, fontWeight: '900', fontSize: 13 },
    tagIncomplete: { color: colors.red, fontSize: 10, fontWeight: 'bold' },
    issuesText: { color: colors.muted, fontSize: 10, textAlign: 'right', paddingHorizontal: 12, paddingBottom: 12, marginTop: 4, lineHeight: 15 },
  });
