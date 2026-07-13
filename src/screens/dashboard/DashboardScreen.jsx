import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { calcAge, isIncomplete } from '../../lib/helpers';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import { showError } from '../../utils/toast';

import colors from '../../theme/colors';

/**
 * الرئيسية — نسخة مطابقة للأصل (camp-registry-react/Dashboard.jsx):
 * ترحيب بالاسم، 4 بطاقات إحصائية بنفس الألوان، توزيع المخيمات (أشرطة)،
 * الفئات العمرية (أشرطة)، إجراءات سريعة بشبكة 2×3.
 */
export default function DashboardScreen() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const { getAllowedCampIds, filterLocal } = useDataScope();

  const [stats, setStats] = useState(null);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    if (!profile?.org_id) return;

    // 1) اعرض النسخة المحفوظة فوراً (لو موجودة وسليمة) — بدون انتظار الشبكة
    // إطلاقاً. هذا يخلي فتح التطبيق يبان فوري حتى لو النت بطيء أو مقطوع.
    // ملاحظة أمان: لو النسخة المحفوظة نفسها "صفر أسر" (بقايا نسخة قديمة
    // فاسدة من قبل إصلاحات سابقة)، نتجاهلها تماماً بدل ما نعرضها كأنها
    // بيانات صحيحة مع شريط "محفوظ" مربك.
    const cached = await getCachedData('dashboard_stats', profile?.id);
    const cacheLooksValid = cached?.data?.stats && cached.data.stats.families > 0;
    const hadCache = cacheLooksValid;
    if (hadCache) {
      setStats(cached.data.stats);
      setFamilies(cached.data.families || []);
      setMembers(cached.data.members || []);
      setCamps(cached.data.camps || []);
      setOfflineInfo({ savedAt: cached.savedAt }); // مبدئياً "محفوظ" -- يُمسح تلقائياً لو نجحت المزامنة تحت
      setLoading(false);
    }

    // 2) بعدين حاول تحديث حي بالخلفية (يزامن البيانات لو فيه نت فعلاً).
    try {
      // فحص الاتصال أولاً -- fetchFamilies/fetchCamps وغيرها تبتلع أخطاءها
      // داخلياً وترجع مصفوفة فاضية بدل رمي استثناء، فالاعتماد على try/catch
      // وحده يفشل يكتشف انقطاع النت (يوصلنا "نجاح" ببيانات فاضية = أصفار).
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) {
        if (!hadCache) showError('لا يوجد اتصال ولا توجد بيانات محفوظة');
        return;
      }

      const [famsRaw, camps] = await withTimeout(
        Promise.all([
          fetchFamilies(profile.org_id),
          fetchCamps(profile.org_id),
        ]),
        12000,
        'انتهت مهلة تحميل البيانات'
      );
      const fams = famsRaw.filter((f) => !f.review_status || f.review_status === 'approved');
      const campIds = getAllowedCampIds(camps);
      const filteredFams = filterLocal(fams, campIds);
      const filteredCamps = campIds === null ? camps : camps.filter((c) => campIds.includes(c.id));

      const famIds = filteredFams.map((f) => f.id);
      const members = await fetchFamilyMembers(famIds);

      // نفس حسابات الأصل بالضبط
      const mByFam = {};
      members.forEach((m) => {
        if (!mByFam[m.family_id]) mByFam[m.family_id] = [];
        mByFam[m.family_id].push(m);
      });
      const incomplete = filteredFams.filter((f) => isIncomplete(f, mByFam[f.id])).length;

      const allPersons = [
        ...filteredFams.map((f) => ({ dob: f.head_dob })),
        ...members.map((m) => ({ dob: m.dob })),
      ];
      let children = 0, adults = 0, elderly = 0, noAge = 0;
      allPersons.forEach((p) => {
        const age = calcAge(p.dob);
        if (age === null) { noAge++; return; }
        if (age < 18) children++;
        else if (age < 60) adults++;
        else elderly++;
      });
      const total = Math.max(filteredFams.length + members.length, 1);

      const campCount = {};
      filteredFams.forEach((f) => {
        campCount[f.camp_id] = (campCount[f.camp_id] || 0) + 1;
      });
      const campBars = [...filteredCamps]
        .sort((a, b) => (campCount[b.id] || 0) - (campCount[a.id] || 0))
        .map((c) => ({
          name: c.name,
          count: campCount[c.id] || 0,
          pct: Math.round(((campCount[c.id] || 0) / Math.max(filteredFams.length, 1)) * 100),
        }));

      const finalStats = {
        families: filteredFams.length,
        members: filteredFams.length + members.length,
        camps: filteredCamps.length,
        incomplete,
        children,
        adults,
        elderly,
        noAge,
        total,
        campBars,
      };
      setStats(finalStats);
      setFamilies(filteredFams);
      setMembers(members);
      setCamps(filteredCamps);
      setOfflineInfo(null); // المزامنة نجحت -- البيانات المعروضة الآن حيّة ومحدَّثة
      cacheData('dashboard_stats', profile?.id, { stats: finalStats, families: filteredFams, members, camps: filteredCamps });
    } catch (e) {
      // فشلت المزامنة الحية -- لو ما عندنا نسخة محفوظة من الأساس، هذا فشل حقيقي
      if (!hadCache) showError('تعذّر تحميل البيانات ولا توجد نسخة محفوظة');
      // وإلا: النسخة المحفوظة ظاهرة أصلاً من الخطوة 1، نسيبها كما هي
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.org_id]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  const onRefresh = () => { setRefreshing(true); loadStats(); };

  // بحث ذكي بجزء من الاسم أو رقم الهوية — أرباب الأسر والأفراد معاً.
  // يبدأ الفحص من حرفين فما فوق عشان ما يشتغل بلا داعي بأول حرف.
  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);
  const membersByFamily = useMemo(() => {
    const map = {};
    members.forEach((m) => { (map[m.family_id] ??= []).push(m); });
    return map;
  }, [members]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const results = [];

    families.forEach((f) => {
      if ((f.head_name || '').toLowerCase().includes(q) || (f.head_id || '').includes(q)) {
        results.push({
          key: 'f_' + f.id, familyId: f.id, name: f.head_name, national_id: f.head_id,
          isHead: true, camp: campMap[f.camp_id], memberCount: (membersByFamily[f.id]?.length || 0) + 1,
        });
      }
    });

    members.forEach((m) => {
      if ((m.name || '').toLowerCase().includes(q) || (m.national_id || '').includes(q)) {
        const fam = families.find((f) => f.id === m.family_id);
        results.push({
          key: 'm_' + m.id, familyId: m.family_id, name: m.name, national_id: m.national_id,
          isHead: false, relation: m.relation, headName: fam?.head_name, camp: campMap[fam?.camp_id],
        });
      }
    });

    return results.slice(0, 30);
  }, [search, families, members, campMap, membersByFamily]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'مساء النور';

  const statCards = [
    { icon: '👨‍👩‍👧‍👦', label: 'الأسر', value: stats?.families, color: colors.accent, screen: 'FamiliesList' },
    { icon: '👤', label: 'الأفراد', value: stats?.members, color: colors.blue, screen: 'FamiliesList' },
    { icon: '⛺', label: 'المخيمات', value: stats?.camps, color: colors.green, screen: 'CampsList' },
    { icon: '⚠️', label: 'بيانات ناقصة', value: stats?.incomplete, color: (stats?.incomplete || 0) > 0 ? colors.red : colors.muted, screen: 'FamiliesList' },
  ];

  const ageBars = stats ? [
    { label: 'أطفال 0-17', value: stats.children, color: colors.green },
    { label: 'بالغون 18-59', value: stats.adults, color: colors.blue },
    { label: 'كبار 60+', value: stats.elderly, color: colors.accent },
  ] : [];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* ترحيب */}
        <Text style={styles.greet}>{greet}،</Text>
        <Text style={styles.userName}>{profile?.full_name || 'مرحباً'} 👋</Text>

        {!!offlineInfo && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>
              📡 لا يوجد اتصال بالإنترنت — تُعرض بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة
            </Text>
          </View>
        )}

        {/* بحث ذكي — رباب الأسر والأفراد معاً */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="🔍 ابحث بالاسم أو رقم الهوية (أسر وأفراد)..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />

        {search.trim().length >= 2 && (
          <View style={styles.searchResultsBox}>
            {searchResults.length === 0 ? (
              <Text style={styles.searchEmptyText}>لا نتائج مطابقة</Text>
            ) : (
              searchResults.map((r) => (
                <Pressable
                  key={r.key}
                  style={styles.searchRow}
                  onPress={() => navigation.push('FamilyDetail', { familyId: r.familyId })}
                >
                  <Text style={styles.searchRowIcon}>{r.isHead ? '👨‍👩‍👧' : '👤'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchRowName}>{r.name || '—'}</Text>
                    <Text style={styles.searchRowMeta}>
                      {r.isHead ? `رب أسرة${r.memberCount ? ` · ${r.memberCount} فرد` : ''}` : `${r.relation || 'فرد'} — أسرة ${r.headName || '—'}`}
                      {r.camp ? ` · ${r.camp}` : ''}
                    </Text>
                  </View>
                  {!!r.national_id && <Text style={styles.searchRowId}>{r.national_id}</Text>}
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* إحصائيات رئيسية 2×2 */}
        <View style={styles.statsGrid}>
          {statCards.map((s) => (
            <Pressable
              key={s.label}
              style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}
              onPress={() => s.screen && navigation.push(s.screen)}
            >
              <Text style={styles.statIcon}>{s.icon}</Text>
              <Text style={[styles.statValue, { color: s.color }]}>
                {loading ? '—' : (s.value ?? 0)}
              </Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* توزيع المخيمات + الفئات العمرية */}
        {stats && stats.families > 0 && (
          <View style={styles.twoCol}>
            <View style={styles.panel}>
              <Text style={[styles.panelTitle, { color: colors.accent }]}>📊 توزيع المخيمات</Text>
              {stats.campBars.slice(0, 10).map((c) => (
                <View key={c.name} style={styles.barBlock}>
                  <View style={styles.barLabelRow}>
                    <Text style={styles.barName} numberOfLines={1}>{c.name}</Text>
                    <Text style={[styles.barCount, { color: colors.accent }]}>{c.count}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${c.pct}%`, backgroundColor: colors.accent }]} />
                  </View>
                </View>
              ))}
              {stats.campBars.length === 0 && <Text style={styles.noData}>لا بيانات</Text>}
            </View>

            <View style={styles.panel}>
              <Text style={[styles.panelTitle, { color: colors.blue }]}>👶 الفئات العمرية</Text>
              {ageBars.map((b) => (
                <View key={b.label} style={styles.barBlock}>
                  <View style={styles.barLabelRow}>
                    <Text style={styles.barName}>{b.label}</Text>
                    <Text style={[styles.barCount, { color: b.color }]}>{b.value}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.round((b.value / stats.total) * 100) || 0}%`, backgroundColor: b.color },
                      ]}
                    />
                  </View>
                </View>
              ))}
              {stats.noAge > 0 && (
                <Text style={styles.noAgeWarn}>⚠️ {stats.noAge} بدون تاريخ ميلاد</Text>
              )}
            </View>
          </View>
        )}

        {/* لا بيانات */}
        {!loading && stats?.families === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📥</Text>
            <Text style={styles.emptyTitle}>لا توجد بيانات</Text>
            <Text style={styles.emptySub}>لم يتم العثور على أسر مسجّلة بعد</Text>
            <Pressable style={styles.reloadBtn} onPress={loadStats}>
              <Text style={styles.reloadText}>🔄 إعادة التحميل</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  greet: { color: colors.muted, fontSize: 14, textAlign: 'right' },
  userName: { color: colors.white, fontWeight: '900', fontSize: 20, textAlign: 'right', marginBottom: 16 },
  offlineBanner: {
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 12, padding: 10, marginBottom: 12,
  },
  offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },

  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 8,
  },
  searchResultsBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8, marginBottom: 16 },
  searchEmptyText: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 14 },
  searchRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchRowIcon: { fontSize: 16 },
  searchRowName: { color: colors.white, fontWeight: 'bold', fontSize: 12, textAlign: 'right' },
  searchRowMeta: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
  searchRowId: { color: colors.accent, fontSize: 10, fontWeight: 'bold' },
  statCard: {
    width: '48.5%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statIcon: { fontSize: 24, marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
  twoCol: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  panel: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  panelTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 12, textAlign: 'right' },
  barBlock: { marginBottom: 8 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barName: { color: colors.white, fontSize: 10, flex: 1 },
  barCount: { fontSize: 10, fontWeight: 'bold' },
  barTrack: { height: 6, backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  noData: { color: colors.muted, fontSize: 10 },
  noAgeWarn: { color: colors.muted, fontSize: 9, marginTop: 4, textAlign: 'right' },
  emptyBox: { alignItems: 'center', paddingVertical: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: colors.white, fontWeight: 'bold', marginBottom: 4 },
  emptySub: { color: colors.muted, fontSize: 12, marginBottom: 16 },
  reloadBtn: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  reloadText: { color: '#000', fontWeight: '900', fontSize: 14 },
});
