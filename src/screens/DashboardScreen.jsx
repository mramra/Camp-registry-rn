import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useDataScope } from '../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../lib/supabase';
import { calcAge, isIncomplete } from '../lib/helpers';
import colors from '../theme/colors';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    if (!profile?.org_id) return;
    try {
      const [famsRaw, camps] = await Promise.all([
        fetchFamilies(profile.org_id),
        fetchCamps(profile.org_id),
      ]);
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

      setStats({
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
      });
    } catch (e) {
      // بدون console — الشاشة تعرض حالة "لا بيانات" مع زر إعادة تحميل
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.org_id]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  const onRefresh = () => { setRefreshing(true); loadStats(); };

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'مساء النور';

  const statCards = [
    { icon: '👨‍👩‍👧‍👦', label: 'الأسر', value: stats?.families, color: colors.accent, screen: 'FamiliesList' },
    { icon: '👤', label: 'الأفراد', value: stats?.members, color: colors.blue, screen: 'FamiliesList' },
    { icon: '⛺', label: 'المخيمات', value: stats?.camps, color: colors.green, screen: 'CampsList' },
    { icon: '⚠️', label: 'بيانات ناقصة', value: stats?.incomplete, color: (stats?.incomplete || 0) > 0 ? colors.red : '#6b7280', screen: 'FamiliesList' },
  ];

  const quickActions = [
    { icon: '➕', label: 'إضافة أسرة', screen: 'FamilyForm' },
    { icon: '🏕️', label: 'المخيمات', screen: 'CampsList' },
    { icon: '👨‍👩‍👧‍👦', label: 'قائمة الأسر', screen: 'FamiliesList' },
    { icon: '👥', label: 'المستخدمون', screen: 'UsersList' },
    { icon: '🚶', label: 'حركات الأسر', screen: 'Movements' },
    { icon: '📦', label: 'التوزيعات', screen: 'Distributions' },
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
    else if (a.screen) navigation.navigate(a.screen);
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

        {/* إحصائيات رئيسية 2×2 */}
        <View style={styles.statsGrid}>
          {statCards.map((s) => (
            <Pressable
              key={s.label}
              style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}
              onPress={() => s.screen && navigation.navigate(s.screen)}
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
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
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
  emptyBox: { alignItems: 'center', paddingVertical: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: colors.white, fontWeight: 'bold', marginBottom: 4 },
  emptySub: { color: colors.muted, fontSize: 12, marginBottom: 16 },
  reloadBtn: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  reloadText: { color: '#000', fontWeight: '900', fontSize: 14 },
});
