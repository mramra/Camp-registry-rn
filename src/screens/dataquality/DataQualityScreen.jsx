import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { checkFamilyIssues, hasMissingDob, computeDuplicateSets, hasDataQualityIssue } from '../../lib/helpers';
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
  { key: 'dob', label: '🎂 تاريخ الميلاد (رب الأسرة أو أي فرد)', match: null },
  { key: 'marital', label: '💍 الحالة الاجتماعية', match: (f, issues) => issues.includes('الحالة الاجتماعية ناقصة') },
  { key: 'spouse', label: '👰 بيانات الزوجة (لمتزوج)', match: (f, issues) => issues.includes('بيانات الزوجة ناقصة') },
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
  const [search, setSearch] = useState('');

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

  const { dupIdSet, dupPhoneSet } = useMemo(
    () => computeDuplicateSets(families, allMembers),
    [families, allMembers]
  );

  const matchesType = useCallback((f, key) => {
    if (!key) return hasDataQualityIssue(f, membersByFamily[f.id], dupIdSet, dupPhoneSet);
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
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => {
        const headMatch =
          (f.head_name || '').toLowerCase().includes(q) ||
          (f.head_id || '').includes(q) ||
          (f.phone1 || '').includes(q);
        if (headMatch) return true;
        return (membersByFamily[f.id] || []).some(
          (m) => (m.name || '').toLowerCase().includes(q) || (m.national_id || '').includes(q)
        );
      });
    }
    return list.sort(
      (a, b) => checkFamilyIssues(b, membersByFamily[b.id]).length - checkFamilyIssues(a, membersByFamily[a.id]).length
    );
  }, [families, filterCamp, filterType, search, matchesType, membersByFamily]);

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
              value={filterCamp ? `المخيم: ${campMap[filterCamp]}` : undefined}
              options={[{ value: '', label: 'كل المخيمات' }, ...camps.map((c) => ({ value: c.id, label: c.name }))]}
              onSelect={setFilterCamp}
              placeholder="المخيم: كل المخيمات"
            />
            <SelectField
              value={filterType ? `نوع النقص: ${DATA_TYPE_OPTIONS.find((o) => o.key === filterType)?.label}` : undefined}
              options={DATA_TYPE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
              onSelect={setFilterType}
              placeholder="نوع النقص: — كل النواقص والتكررات —"
            />
            {/* بحث حر: رقم هوية/اسم/جوال رب الأسرة أو أي فرد */}
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث برقم الهوية أو الاسم أو الجوال (رب الأسرة أو فرد)..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
            {filtered.length > 0 && (
              <Pressable
                style={styles.smsBtn}
                onPress={() => {
                  // ملخص نصي مختصر لنواقص/تكررات كل أسرة -- يُستخدم بديل
                  // {نواقص} داخل الرسالة، فكل أسرة توصلها رسالة مخصّصة
                  // بالضبط بما ينقصها هي (مو نص عام موحّد للكل).
                  const missingSummaries = {};
                  filtered.forEach((f) => {
                    const parts = [...checkFamilyIssues(f, membersByFamily[f.id])];
                    if (hasMissingDob(f, membersByFamily[f.id])) parts.push('تاريخ ميلاد ناقص');
                    if (dupIdSet.has(f.id)) parts.push('رقم هوية مكرر');
                    if (dupPhoneSet.has(f.id)) parts.push('رقم جوال مكرر');
                    missingSummaries[f.id] = parts.join('، ') || 'مراجعة عامة للبيانات';
                  });
                  navigation.navigate('SMS', {
                    preselectFamilyIds: filtered.map((f) => f.id),
                    missingSummaries,
                    presetMessage:
                      'السيد/ة {اسم}، لاحظنا أن بياناتكم بالنظام ناقصة بالتالي: {نواقص}. برجاء استكمالها عبر بوابة الأسرة بالتطبيق أو التواصل معنا. شكراً لتعاونكم.',
                  });
                }}
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
    searchInput: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 10,
    },

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
