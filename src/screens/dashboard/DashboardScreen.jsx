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
import { fetchFamilies, fetchFamilyMembers, fetchCamps, fetchFamilyActivityLog } from '../../lib/supabase';
import { calcAge, isIncomplete } from '../../lib/helpers';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import { showError } from '../../utils/toast';

import BottomSheetModal from '../../components/ui/BottomSheetModal';
import colors from '../../theme/colors';

const ACTIVITY_FIELD_LABELS = {
  head_name: 'اسم رب الأسرة', head_id: 'رقم الهوية', head_dob: 'تاريخ الميلاد',
  head_gender: 'الجنس', head_marital: 'الحالة الاجتماعية', phone1: 'رقم الجوال',
  phone2: 'جوال بديل', camp_id: 'المخيم', tent: 'رقم الخيمة',
  original_address: 'العنوان الأصلي', address_details: 'تفاصيل العنوان', notes: 'ملاحظات',
  category_tags: 'الفئة الاجتماعية',
  review_status: 'حالة المراجعة', head_qualification: 'المؤهل العلمي',
};

/**
 * الرئيسية — نسخة مطابقة للأصل (camp-registry-react/Dashboard.jsx):
 * ترحيب بالاسم، 4 بطاقات إحصائية بنفس الألوان، توزيع المخيمات (أشرطة)،
 * الفئات العمرية (أشرطة)، إجراءات سريعة بشبكة 2×3.
 */
export default function DashboardScreen() {
  const navigation = useNavigation();
  const { profile, logout } = useAuth();
  const { getAllowedCampIds, filterLocal } = useDataScope();

  const [stats, setStats] = useState(null);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
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
      setActivity(cached.data.activityLog || []);
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

      const [famsRaw, camps, activityLog] = await withTimeout(
        Promise.all([
          fetchFamilies(profile.org_id),
          fetchCamps(profile.org_id),
          fetchFamilyActivityLog(profile.org_id, 15),
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
      setActivity(activityLog);
      setFamilies(filteredFams);
      setMembers(members);
      setCamps(filteredCamps);
      setOfflineInfo(null); // المزامنة نجحت -- البيانات المعروضة الآن حيّة ومحدَّثة
      cacheData('dashboard_stats', profile?.id, { stats: finalStats, families: filteredFams, members, camps: filteredCamps, activityLog });
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

  const quickActions = [
    { icon: '➕', label: 'إضافة أسرة', screen: 'FamilyForm' },
    { icon: '🏕️', label: 'المخيمات', screen: 'CampsList' },
    { icon: '👨‍👩‍👧‍👦', label: 'قائمة الأسر', screen: 'FamiliesList' },
    { icon: '👥', label: 'المستخدمون', screen: 'UsersList' },
    { icon: '🚶', label: 'حركات الأسر', screen: 'Movements' },
    { icon: '📦', label: 'التوزيعات', screen: 'Distributions' },
    { icon: '🧒', label: 'سجل الأطفال', screen: 'Children' },
    { icon: '👩', label: 'النساء', screen: 'Women' },
    { icon: '🩺', label: 'سجل الحالات الصحية', screen: 'HealthRecords' },
    { icon: '💬', label: 'الرسائل', screen: 'SMS' },
    ...(profile?.role === 'platform_owner'
      ? [{ icon: '🔐', label: 'إدارة الصلاحيات', screen: 'PermissionsAdmin' }]
      : []),
    { icon: '🚪', label: 'تسجيل الخروج', action: 'logout' },
  ];

  const ageBars = stats ? [
    { label: 'أطفال 0-17', value: stats.children, color: colors.green },
    { label: 'بالغون 18-59', value: stats.adults, color: colors.blue },
    { label: 'كبار 60+', value: stats.elderly, color: colors.accent },
  ] : [];

  const handleQuickAction = (a) => {
    if (a.action === 'logout') logout();
    else if (a.screen) navigation.push(a.screen);
  };

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

        {/* إجراءات سريعة */}
        <View style={styles.panelFull}>
          <Text style={styles.quickTitle}>⚡ إجراءات سريعة</Text>
          <View style={styles.quickGrid}>
            {quickActions.map((a) => (
              <Pressable
                key={a.label}
                style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]}
                onPress={() => handleQuickAction(a)}
              >
                <Text style={styles.quickIcon}>{a.icon}</Text>
                <Text style={styles.quickLabel}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* آخر التعديلات على الأسر */}
        {activity.length > 0 && (
          <View style={styles.panelFull}>
            <Text style={styles.quickTitle}>📝 آخر التعديلات على الأسر</Text>
            {activity.map((a) => {
              const meta =
                a.action === 'insert' ? { icon: '➕', color: colors.green, label: 'إضافة' } :
                a.action === 'delete' ? { icon: '🗑️', color: colors.red, label: 'حذف' } :
                { icon: '✏️', color: colors.blue, label: 'تعديل' };
              const when = new Date(a.created_at);
              const timeStr = isNaN(when) ? '' : when.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              return (
                <Pressable key={a.id} style={styles.activityRow} onPress={() => setSelectedActivity(a)}>
                  <View style={[styles.activityIconBox, { backgroundColor: `${meta.color}22` }]}>
                    <Text style={styles.activityIcon}>{meta.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityLine}>
                      <Text style={{ color: meta.color, fontWeight: 'bold' }}>{meta.label}</Text> — {a.family_name || 'أسرة'}
                      {a.members_count ? ` (${a.members_count} فرد)` : ''}
                    </Text>
                    <Text style={styles.activityMeta}>👤 {a.actor_name || 'غير معروف'} · 🕒 {timeStr}</Text>
                  </View>
                  <Text style={styles.activityChevron}>‹</Text>
                </Pressable>
              );
            })}
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

      <BottomSheetModal
        visible={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        title="📝 تفاصيل الحركة"
      >
        {selectedActivity && (() => {
          const a = selectedActivity;
          const meta =
            a.action === 'insert' ? { icon: '➕', color: colors.green, label: 'إضافة أسرة جديدة' } :
            a.action === 'delete' ? { icon: '🗑️', color: colors.red, label: 'حذف أسرة' } :
            { icon: '✏️', color: colors.blue, label: 'تعديل بيانات أسرة' };
          const when = new Date(a.created_at);
          const fullTime = isNaN(when)
            ? '—'
            : when.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          const changeEntries = a.changes && typeof a.changes === 'object' ? Object.entries(a.changes) : [];

          return (
            <View>
              <View style={[styles.detailBadge, { backgroundColor: `${meta.color}22` }]}>
                <Text style={[styles.detailBadgeText, { color: meta.color }]}>{meta.icon} {meta.label}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>الأسرة</Text>
                <Text style={styles.detailValue}>{a.family_name || '—'}</Text>
              </View>
              {!!a.members_count && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>عدد الأفراد</Text>
                  <Text style={styles.detailValue}>{a.members_count}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>من قام بالإجراء</Text>
                <Text style={styles.detailValue}>{a.actor_name || 'غير معروف'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>التاريخ والوقت</Text>
                <Text style={styles.detailValue}>{fullTime}</Text>
              </View>

              {changeEntries.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.detailChangesTitle}>التغييرات ({changeEntries.length})</Text>
                  {changeEntries.map(([field, val]) => (
                    <View key={field} style={styles.changeCard}>
                      <Text style={styles.changeField}>{ACTIVITY_FIELD_LABELS[field] || field}</Text>
                      <View style={styles.changeValuesRow}>
                        <View style={styles.changeOld}>
                          <Text style={styles.changeOldLabel}>القديم</Text>
                          <Text style={styles.changeOldValue}>{(val?.old ?? val?.from) || '(فارغ)'}</Text>
                        </View>
                        <Text style={styles.changeArrow}>←</Text>
                        <View style={styles.changeNew}>
                          <Text style={styles.changeNewLabel}>الجديد</Text>
                          <Text style={styles.changeNewValue}>{val?.new ?? val?.to ?? '(فارغ)'}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {a.action === 'insert' && changeEntries.length === 0 && (
                <Text style={styles.detailNote}>سجل إضافة جديد — لا تفاصيل تغييرات مسجّلة لهذا الحدث.</Text>
              )}
            </View>
          );
        })()}
      </BottomSheetModal>
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
  pressed: { transform: [{ scale: 0.95 }] },
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
  panelFull: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
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
  quickTitle: { color: colors.white, fontSize: 12, fontWeight: 'bold', marginBottom: 12, textAlign: 'right' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickIcon: { fontSize: 18 },
  quickLabel: { color: colors.white, fontSize: 12, fontWeight: 'bold' },
  activityRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  activityIconBox: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  activityIcon: { fontSize: 14 },
  activityLine: { color: colors.white, fontSize: 12, textAlign: 'right' },
  activityMeta: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
  activityChevron: { color: colors.muted, fontSize: 18 },

  detailBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 14 },
  detailBadgeText: { fontWeight: '900', fontSize: 13 },
  detailRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.muted, fontSize: 12 },
  detailValue: { color: colors.white, fontSize: 12, fontWeight: 'bold' },
  detailChangesTitle: { color: colors.accent, fontWeight: '900', fontSize: 12, marginBottom: 8, textAlign: 'right' },
  detailNote: { color: colors.muted, fontSize: 11, marginTop: 12, textAlign: 'right', lineHeight: 17 },

  changeCard: { backgroundColor: colors.surface2, borderRadius: 12, padding: 10, marginBottom: 8 },
  changeField: { color: colors.white, fontWeight: 'bold', fontSize: 12, marginBottom: 6, textAlign: 'right' },
  changeValuesRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  changeOld: { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 8 },
  changeOldLabel: { color: colors.red, fontSize: 9, fontWeight: 'bold', textAlign: 'right' },
  changeOldValue: { color: colors.white, fontSize: 11, marginTop: 2, textAlign: 'right' },
  changeArrow: { color: colors.muted, fontSize: 14 },
  changeNew: { flex: 1, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: 8 },
  changeNewLabel: { color: colors.green, fontSize: 9, fontWeight: 'bold', textAlign: 'right' },
  changeNewValue: { color: colors.white, fontSize: 11, marginTop: 2, textAlign: 'right' },
  emptyBox: { alignItems: 'center', paddingVertical: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: colors.white, fontWeight: 'bold', marginBottom: 4 },
  emptySub: { color: colors.muted, fontSize: 12, marginBottom: 16 },
  reloadBtn: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  reloadText: { color: '#000', fontWeight: '900', fontSize: 14 },
});
