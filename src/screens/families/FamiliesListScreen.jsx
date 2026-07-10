import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { checkFamilyIssues, isIncomplete, isAgeInRange, getMembers } from '../../lib/helpers';
import { cacheData, getCachedData } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import Badge from '../../components/ui/Badge';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import colors from '../../theme/colors';


// ── فلاتر ثابتة (نفس النسخة الأصلية) ──────────────────────
const MISS_OPTIONS = [
  { key: '', label: 'الكل' },
  { key: 'incomplete', label: '⚠️ ناقص' },
  { key: 'dup_id', label: '🔁 هوية مكررة' },
  { key: 'dup_phone', label: '📞 جوال مكرر' },
];

const APPROVAL_OPTIONS = [
  { key: 'approved', label: '✅ مكتمل' },
  { key: 'pending', label: '🔍 قيد المراجعة' },
  { key: 'rejected', label: '❌ مرفوض' },
  { key: '', label: 'الكل' },
];

const GENDER_OPTIONS = [
  { key: '', label: 'كل الجنس' },
  { key: 'ذكر', label: '👨 ذكر' },
  { key: 'أنثى', label: '👩 أنثى' },
];

export default function FamiliesListScreen() {
  const navigation = useNavigation();
  const { profile, orgId, canWrite } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [filterCamp, setFilterCamp] = useState('');
  const [filterMiss, setFilterMiss] = useState('');
  const [filterApproval, setFilterApproval] = useState('approved');
  const [filterGender, setFilterGender] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);

  // ── تحميل البيانات (مباشرة من Supabase — بدون طبقة SQLite وسيطة) ──
  const loadData = useCallback(async () => {
    if (!orgId) return;

    // 1) اعرض النسخة المحفوظة فوراً (لو موجودة) — بدون انتظار الشبكة.
    const cached = await getCachedData('families_list', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      setFamilies(cached.data.families || []);
      setAllMembers(cached.data.members || []);
      setCamps(cached.data.camps || []);
      setOfflineInfo({ savedAt: cached.savedAt });
      setLoading(false);
    }

    // 2) بعدين حاول تحديث حي بالخلفية.
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        if (!hadCache) showError('لا يوجد اتصال ولا توجد بيانات محفوظة');
        return;
      }

      const allowedCampIds = getAllowedCampIds(camps.length ? camps : await fetchCamps(orgId));

      const [famsRaw, campsData] = await Promise.all([
        fetchFamilies(orgId),
        fetchCamps(orgId),
      ]);
      const fams =
        allowedCampIds === null
          ? famsRaw
          : famsRaw.filter((f) => allowedCampIds.includes(f.camp_id));

      const members = await fetchFamilyMembers(fams.map((f) => f.id));

      setCamps(campsData);
      setFamilies(fams);
      setAllMembers(members);
      setOfflineInfo(null);
      cacheData('families_list', profile?.id, { families: fams, members, camps: campsData });
    } catch (e) {
      if (!hadCache) showError('تعذّر تحميل البيانات ولا توجد نسخة محفوظة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  // ملاحظة: الاستيراد الجماعي من Excel صار حصراً بشاشة "استيراد وتصدير"
  // (كان مكرَّراً هنا سابقاً).

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // ── خرائط مساعدة ──────────────────────────────────────
  const campMap = useMemo(() => {
    const map = {};
    camps.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [camps]);

  const membersByFamily = useMemo(() => {
    const map = {};
    allMembers.forEach((m) => {
      if (!map[m.family_id]) map[m.family_id] = [];
      map[m.family_id].push(m);
    });
    return map;
  }, [allMembers]);

  // ── كشف التكرار (هوية/جوال) — نفس منطق الأصل حرفياً ──
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
    const dupIdSet = new Set(
      families
        .filter((f) => (idOwners[f.head_id]?.size || 0) > 1)
        .map((f) => f.id)
    );

    const cleanPhone = (p) => (p || '').replace(/\s/g, '');
    const phoneCounts = {};
    families.forEach((f) => {
      if (!f.phone1) return;
      const p = cleanPhone(f.phone1);
      phoneCounts[p] = (phoneCounts[p] || 0) + 1;
    });
    const dupPhoneSet = new Set(
      families.filter((f) => f.phone1 && phoneCounts[cleanPhone(f.phone1)] > 1).map((f) => f.id)
    );

    return { dupIdSet, dupPhoneSet };
  }, [families, allMembers]);

  // ── أعداد الفلاتر (تتغير حسب المخيم المختار) ─────────
  const counts = useMemo(() => {
    const base = filterCamp ? families.filter((f) => f.camp_id === filterCamp) : families;
    return {
      incomplete: base.filter((f) => isIncomplete(f, membersByFamily[f.id])).length,
      dup_id: base.filter((f) => dupIdSet.has(f.id)).length,
      dup_phone: base.filter((f) => dupPhoneSet.has(f.id)).length,
      approved: base.filter((f) => (f.review_status || 'approved') === 'approved').length,
      pending: base.filter((f) => f.review_status === 'pending').length,
      rejected: base.filter((f) => f.review_status === 'rejected').length,
    };
  }, [families, filterCamp, membersByFamily, dupIdSet, dupPhoneSet]);

  const visibleCamps = useMemo(() => getVisibleCamps(camps), [camps, getVisibleCamps]);

  // ── الفلترة والترتيب — نفس منطق الأصل حرفياً ─────────
  const filtered = useMemo(() => {
    let list = [...families];

    if (filterCamp) list = list.filter((f) => f.camp_id === filterCamp);
    if (filterGender) list = list.filter((f) => f.head_gender === filterGender);
    if (filterApproval) list = list.filter((f) => (f.review_status || 'approved') === filterApproval);
    if (filterMiss === 'incomplete') list = list.filter((f) => isIncomplete(f, membersByFamily[f.id]));
    if (filterMiss === 'dup_id') list = list.filter((f) => dupIdSet.has(f.id));
    if (filterMiss === 'dup_phone') list = list.filter((f) => dupPhoneSet.has(f.id));

    if (ageMin || ageMax) {
      list = list.filter((f) => {
        if (isAgeInRange(f.head_dob, ageMin, ageMax)) return true;
        return (membersByFamily[f.id] || []).some((m) => isAgeInRange(m.dob, ageMin, ageMax));
      });
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (f) =>
          (f.head_name || '').toLowerCase().includes(q) ||
          (f.head_id || '').includes(q) ||
          (f.phone1 || '').includes(q)
      );
    }

    if (filterMiss === 'incomplete') {
      list.sort(
        (a, b) =>
          checkFamilyIssues(b, membersByFamily[b.id]).length -
          checkFamilyIssues(a, membersByFamily[a.id]).length
      );
    } else {
      list.sort(
        (a, b) => getMembers(allMembers, b).length - getMembers(allMembers, a).length
      );
    }

    return list;
  }, [families, membersByFamily, dupIdSet, dupPhoneSet, filterCamp, filterGender, filterApproval, filterMiss, ageMin, ageMax, search, allMembers]);

  const hasFilter =
    !!filterCamp || !!filterMiss || !!filterGender || !!ageMin || !!ageMax || !!search || filterApproval !== 'approved';

  const resetFilters = () => {
    setFilterCamp('');
    setFilterMiss('');
    setFilterGender('');
    setFilterApproval('approved');
    setAgeMin('');
    setAgeMax('');
    setSearch('');
  };

  // ── عرض بطاقة أسرة واحدة ──────────────────────────────
  const renderFamily = ({ item: f }) => {
    const fMembers = membersByFamily[f.id] || [];
    const issues = checkFamilyIssues(f, fMembers);
    const incomplete = issues.length > 0;
    const isDupId = dupIdSet.has(f.id);
    const isDupPhone = dupPhoneSet.has(f.id);
    const memberCount = getMembers(allMembers, f).length + 1;

    // شريط ملوّن يمين البطاقة حسب نوع المشكلة (أحمر=ناقص، بنفسجي=هوية، أزرق=جوال)
    const borderColor = incomplete
      ? colors.red
      : isDupId
      ? colors.purple
      : isDupPhone
      ? colors.blue
      : 'transparent';

    return (
      <Pressable
        onPress={() => navigation.navigate('FamilyDetail', { familyId: f.id })}
        style={({ pressed }) => [
          styles.card,
          { borderRightColor: borderColor },
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headName}>{f.head_name || '—'}</Text>
            {!!f.head_id && <Text style={styles.headId}>{f.head_id}</Text>}
          </View>
          <View style={styles.memberBadge}>
            <Text style={styles.memberCount}>{memberCount}</Text>
            <Text style={styles.memberIcon}>👥</Text>
          </View>
        </View>

        <View style={styles.badgesRow}>
          {f.review_status === 'pending' && <Badge label="🔍 قيد المراجعة" color={colors.accent} />}
          {f.review_status === 'rejected' && <Badge label="❌ مرفوض" color={colors.red} />}
          {incomplete && <Badge label={`⚠️ ${issues.length} نقص`} color={colors.red} />}
          {isDupId && <Badge label="🔁 هوية" color={colors.purple} />}
          {isDupPhone && <Badge label="📞 جوال" color={colors.blue} />}
          {!incomplete && !isDupId && !isDupPhone && <Text style={styles.okMark}>✅</Text>}
        </View>

        <View style={styles.cardBottom}>
          <Text style={styles.campName}>{campMap[f.camp_id] || '—'}</Text>
          {!!f.phone1 && <Text style={styles.phone}>{f.phone1}</Text>}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderFamily}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="👨‍👩‍👧‍👦"
              title="قائمة الأسر"
              subtitle={
                <Text style={styles.headerSubtitle}>
                  {filtered.length}/{families.length} أسرة
                </Text>
              }
              action={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {canWrite && (
                    <Pressable
                      style={styles.addBtn}
                      onPress={() => navigation.navigate('FamilyForm')}
                    >
                      <Text style={styles.addBtnText}>➕ إضافة</Text>
                    </Pressable>
                  )}
                </View>
              }
            />

            {!!offlineInfo && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة (لا يمكن الإضافة/التعديل/الحذف الآن)
                </Text>
              </View>
            )}
            {/* البحث */}
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث باسم رب الأسرة أو رقم الهوية أو الجوال..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            {/* فلتر جودة البيانات */}
            <View style={styles.chipsRow}>
              {MISS_OPTIONS.map((o) => (
                <FilterChip
                  key={o.key || 'all'}
                  label={o.key ? `${o.label} (${counts[o.key]})` : `${o.label} (${families.length})`}
                  selected={filterMiss === o.key}
                  onPress={() => setFilterMiss(o.key)}
                />
              ))}
            </View>

            {/* فلتر حالة المراجعة */}
            <View style={styles.chipsRow}>
              {APPROVAL_OPTIONS.map((o) => (
                <FilterChip
                  key={o.key || 'all'}
                  label={o.key ? `${o.label} (${counts[o.key]})` : `${o.label} (${families.length})`}
                  selected={filterApproval === o.key}
                  onPress={() => setFilterApproval(o.key)}
                />
              ))}
            </View>

            {/* المخيم + الجنس */}
            <View style={styles.chipsRow}>
              <FilterChip
                label={filterCamp ? campMap[filterCamp] : `كل المخيمات (${families.length})`}
                selected={!!filterCamp}
                onPress={() => setCampPickerVisible(true)}
              />
              {GENDER_OPTIONS.map((o) => (
                <FilterChip
                  key={o.key || 'all'}
                  label={o.label}
                  selected={filterGender === o.key}
                  onPress={() => setFilterGender(o.key)}
                />
              ))}
              {hasFilter && (
                <Pressable style={styles.resetBtn} onPress={resetFilters}>
                  <Text style={styles.resetText}>↺ إعادة</Text>
                </Pressable>
              )}
            </View>

            {/* فلتر العمر */}
            <View style={styles.ageRow}>
              <Text style={styles.ageLabel}>🎂 العمر من</Text>
              <TextInput
                value={ageMin}
                onChangeText={setAgeMin}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={colors.muted}
                style={styles.ageInput}
              />
              <Text style={styles.ageLabel}>إلى</Text>
              <TextInput
                value={ageMax}
                onChangeText={setAgeMax}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={colors.muted}
                style={styles.ageInput}
              />
              <Text style={styles.ageLabel}>سنة</Text>
              {hasFilter && <Text style={styles.resultCount}>{filtered.length} نتيجة</Text>}
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="📭"
              title="لا توجد أسر مطابقة"
              subtitle={hasFilter ? 'جرّب تعديل الفلاتر' : 'لم يتم تسجيل أي أسرة بعد'}
              actionLabel={hasFilter ? '↺ إعادة ضبط الفلاتر' : undefined}
              onAction={resetFilters}
            />
          )
        }
      />

      {/* ورقة اختيار المخيم */}
      <BottomSheetModal
        visible={campPickerVisible}
        onClose={() => setCampPickerVisible(false)}
        title="اختر المخيم"
      >
        <Pressable
          style={styles.campOption}
          onPress={() => {
            setFilterCamp('');
            setCampPickerVisible(false);
          }}
        >
          <Text style={styles.campOptionText}>كل المخيمات ({families.length})</Text>
        </Pressable>
        {visibleCamps.map((c) => (
          <Pressable
            key={c.id}
            style={styles.campOption}
            onPress={() => {
              setFilterCamp(c.id);
              setCampPickerVisible(false);
            }}
          >
            <Text style={styles.campOptionText}>
              {c.name} ({families.filter((f) => f.camp_id === c.id).length})
            </Text>
          </Pressable>
        ))}
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  offlineBanner: {
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 12, padding: 10, marginBottom: 12,
  },
  offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },
  addBtn: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  addBtnText: { color: '#000', fontWeight: '900', fontSize: 12 },

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
    marginBottom: 10,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  resetBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resetText: { color: colors.muted, fontSize: 11, fontWeight: 'bold' },

  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  ageLabel: { color: colors.muted, fontSize: 11 },
  ageInput: {
    width: 52,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 6,
    color: colors.white,
    fontSize: 12,
    textAlign: 'center',
  },
  resultCount: { color: colors.muted, fontSize: 11, marginStart: 'auto' },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRightWidth: 3,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cardPressed: { opacity: 0.85 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headName: { color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'right' },
  headId: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  memberCount: { color: colors.accent, fontWeight: '900', fontSize: 14 },
  memberIcon: { fontSize: 13 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  okMark: { fontSize: 11 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  campName: { color: colors.muted, fontSize: 12 },
  phone: { color: colors.blue, fontSize: 11 },

  campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
});
