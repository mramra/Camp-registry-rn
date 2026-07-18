import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps, supabase } from '../../lib/supabase';
import { naturalCompare, getVulnerabilityScore } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import colors from '../../theme/colors';

const REQUIRED_FIELDS = ['head_name', 'head_id', 'phone1', 'camp_id'];

export default function CampCompareScreen() {
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState('families');
  const [typeFilter, setTypeFilter] = useState('all');
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) throw new Error('لا يوجد اتصال بالإنترنت');

      const camps = await withTimeout(fetchCamps(orgId), 12000, 'انتهت مهلة تحميل البيانات');
      const campIds = getAllowedCampIds(camps);
      const famsRaw = await withTimeout(fetchFamilies(orgId), 12000, 'انتهت مهلة تحميل البيانات');
      const families = filterLocal(famsRaw, campIds);
      const famIdSet = new Set(families.map((f) => f.id));
      const membersRaw = await withTimeout(fetchFamilyMembers(families.map((f) => f.id)), 12000, 'انتهت مهلة تحميل البيانات');
      const members = campIds === null ? membersRaw : membersRaw.filter((m) => famIdSet.has(m.family_id));

      const campFams = {};
      const campMems = {};
      families.forEach((f) => {
        campFams[f.camp_id] = (campFams[f.camp_id] || 0) + 1;
      });
      members.forEach((m) => {
        const fam = families.find((f) => f.id === m.family_id);
        if (fam?.camp_id) campMems[fam.camp_id] = (campMems[fam.camp_id] || 0) + 1;
      });

      const campIncomplete = {};
      families.forEach((f) => {
        if (REQUIRED_FIELDS.some((k) => !f[k]?.toString().trim())) {
          campIncomplete[f.camp_id] = (campIncomplete[f.camp_id] || 0) + 1;
        }
      });

      // درجة الضعف لكل أسرة -- عدد الأسر شديدة/حرجة الضعف لكل مخيم
      const membersByFam = {};
      members.forEach((m) => {
        (membersByFam[m.family_id] = membersByFam[m.family_id] || []).push(m);
      });
      const campVulnerable = {};
      families.forEach((f) => {
        const tier = getVulnerabilityScore(f, membersByFam[f.id]).tier;
        if (tier === 'high' || tier === 'critical') {
          campVulnerable[f.camp_id] = (campVulnerable[f.camp_id] || 0) + 1;
        }
      });

      // عدد الأسر يلي استلمت مساعدة فعلياً (مرة واحدة على الأقل) لكل مخيم --
      // وفجوة التغطية الدقيقة (أسرة شديدة الضعف + لم تستلم مساعدة، مو مجرد
      // طرح تقريبي للمجاميع لأنها قد لا تكون نفس الأسر)
      const campAidReceived = {};
      const campCoverageGap = {};
      try {
        const { data: aidRows } = await withTimeout(
          supabase.from('camp_dist_families').select('family_id').eq('_deleted', false).in('family_id', [...famIdSet]),
          10000,
          'انتهت مهلة تحميل بيانات المساعدات'
        );
        const familiesWithAid = new Set((aidRows || []).map((r) => r.family_id));
        families.forEach((f) => {
          if (familiesWithAid.has(f.id)) campAidReceived[f.camp_id] = (campAidReceived[f.camp_id] || 0) + 1;
          const tier = getVulnerabilityScore(f, membersByFam[f.id]).tier;
          if ((tier === 'high' || tier === 'critical') && !familiesWithAid.has(f.id)) {
            campCoverageGap[f.camp_id] = (campCoverageGap[f.camp_id] || 0) + 1;
          }
        });
      } catch {
        // فشل تحميل بيانات المساعدات غير حرج -- تظهر كـ0 بدل ما توقف الشاشة كاملة
      }

      const visibleCamps = getVisibleCamps(camps);
      const rows = visibleCamps.map((c) => {
        const fCount = campFams[c.id] || 0;
        const mCount = campMems[c.id] || 0;
        const cap = c.capacity || 0;
        const pct = cap > 0 ? Math.min(100, Math.round((fCount / cap) * 100)) : null;
        return {
          id: c.id,
          name: c.name,
          type: c.camp_type || 'main',
          parentId: c.parent_camp_id,
          families: fCount,
          members: fCount + mCount,
          capacity: cap,
          pct,
          incomplete: campIncomplete[c.id] || 0,
          vulnerable: campVulnerable[c.id] || 0,
          aidReceived: campAidReceived[c.id] || 0,
          coverageGap: campCoverageGap[c.id] || 0,
          status: c.status || 'active',
        };
      });
      setData(rows);
      setOfflineInfo(null);
      cacheData('camp_compare', profile?.id, { rows });
    } catch (e) {
      const cached = await getCachedData('camp_compare', profile?.id);
      if (cached?.data) {
        setData(cached.data.rows || []);
        setOfflineInfo({ savedAt: cached.savedAt });
      } else {
        showError('تعذّر تحميل مقارنة المخيمات');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, filterLocal, getVisibleCamps, profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => Object.fromEntries(data.map((c) => [c.id, c.name])), [data]);

  const filtered = useMemo(() => {
    let rows = data;
    if (typeFilter !== 'all') rows = rows.filter((c) => c.type === typeFilter);
    return [...rows].sort((a, b) => {
      if (sortBy === 'families') return b.families - a.families;
      if (sortBy === 'members') return b.members - a.members;
      if (sortBy === 'pct') return (b.pct ?? -1) - (a.pct ?? -1);
      if (sortBy === 'vulnerable') return b.vulnerable - a.vulnerable;
      if (sortBy === 'name') return naturalCompare(a.name, b.name);
      return 0;
    });
  }, [data, sortBy, typeFilter]);

  const totals = useMemo(
    () => ({
      families: filtered.reduce((s, c) => s + c.families, 0),
      members: filtered.reduce((s, c) => s + c.members, 0),
      incomplete: filtered.reduce((s, c) => s + c.incomplete, 0),
      vulnerable: filtered.reduce((s, c) => s + c.vulnerable, 0),
      aidReceived: filtered.reduce((s, c) => s + c.aidReceived, 0),
    }),
    [filtered]
  );

  const SORT_OPTIONS = [
    { key: 'families', label: 'ترتيب: الأسر' },
    { key: 'members', label: 'ترتيب: الأفراد' },
    { key: 'pct', label: 'ترتيب: الإشغال' },
    { key: 'vulnerable', label: 'ترتيب: الأشد ضعفاً' },
    { key: 'name', label: 'ترتيب: الاسم' },
  ];

  const renderCamp = ({ item: c, index: idx }) => {
    const barColor = c.pct != null ? (c.pct >= 90 ? colors.red : c.pct >= 70 ? colors.accent : colors.green) : colors.muted;

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.indexText}>#{idx + 1}</Text>
              <Text style={styles.typeIcon}>{c.type === 'branch' || c.type === 'sub' ? '🏕️' : '⛺'}</Text>
              <Text style={styles.campName}>{c.name}</Text>
            </View>
            {(c.type === 'branch' || c.type === 'sub') && c.parentId && (
              <Text style={styles.parentText}>↳ {campMap[c.parentId] || '—'}</Text>
            )}
          </View>
          <Text style={[styles.statusBadge, c.status === 'active' ? styles.statusActive : styles.statusInactive]}>
            {c.status === 'active' ? 'نشط' : 'غير نشط'}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          {[
            ['👨‍👩‍👧‍👦', 'أسرة', c.families, colors.accent],
            ['👤', 'فرد', c.members, colors.blue],
            ['📊', 'سعة', c.capacity || '—', colors.muted],
            ['⚠️', 'ناقص', c.incomplete, c.incomplete > 0 ? colors.red : colors.muted],
          ].map(([icon, label, val, color]) => (
            <View key={label} style={styles.miniStat}>
              <Text style={[styles.miniStatValue, { color }]}>{val}</Text>
              <Text style={styles.miniStatLabel}>{icon}{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.statsGrid}>
          {[
            ['🆘', 'شديدة الضعف', c.vulnerable, c.vulnerable > 0 ? colors.red : colors.muted],
            ['📦', 'استلمت مساعدة', c.aidReceived, colors.green],
            ['🕳️', 'فجوة تغطية', c.coverageGap, c.coverageGap > 0 ? colors.orange : colors.muted],
          ].map(([icon, label, val, color]) => (
            <View key={label} style={styles.miniStat}>
              <Text style={[styles.miniStatValue, { color }]}>{val}</Text>
              <Text style={styles.miniStatLabel}>{icon}{label}</Text>
            </View>
          ))}
        </View>

        {c.capacity > 0 && (
          <View>
            <View style={styles.pctRow}>
              <Text style={styles.pctLabel}>الإشغال</Text>
              <Text style={[styles.pctValue, { color: barColor }]}>{c.pct}%</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${c.pct}%`, backgroundColor: barColor }]} />
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderCamp}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="🏕️"
              title="مقارنة المخيمات"
              subtitle={<Text style={styles.headerSubtitle}>{data.length} مخيم</Text>}
            />

            {!!offlineInfo && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة
                </Text>
              </View>
            )}

            <View style={styles.totalsGrid}>
              {[
                ['👨‍👩‍👧‍👦', 'الأسر', totals.families, colors.accent],
                ['👤', 'الأفراد', totals.members, colors.blue],
                ['🆘', 'شديدة الضعف', totals.vulnerable, colors.red],
                ['📦', 'استلمت مساعدة', totals.aidReceived, colors.green],
              ].map(([icon, label, val, color]) => (
                <View key={label} style={styles.totalBox}>
                  <Text style={[styles.totalValue, { color }]}>{val}</Text>
                  <Text style={styles.totalLabel}>{icon} {label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.chipsRow}>
              <FilterChip label="الكل" selected={typeFilter === 'all'} onPress={() => setTypeFilter('all')} />
              <FilterChip label="⛺ رئيسية" selected={typeFilter === 'main'} onPress={() => setTypeFilter('main')} />
              <FilterChip label="🏕️ فروع" selected={typeFilter === 'sub' || typeFilter === 'branch'} onPress={() => setTypeFilter('sub')} />
            </View>
            <View style={styles.chipsRow}>
              {SORT_OPTIONS.map((o) => (
                <FilterChip key={o.key} label={o.label} selected={sortBy === o.key} onPress={() => setSortBy(o.key)} />
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="🏕️" title="لا توجد مخيمات" />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  offlineBanner: {
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 12, padding: 10, marginBottom: 12,
  },
  offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },

  totalsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  totalBox: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, alignItems: 'center' },
  totalValue: { fontSize: 18, fontWeight: '900' },
  totalLabel: { color: colors.muted, fontSize: 9, marginTop: 2 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  nameRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  indexText: { color: colors.muted, fontSize: 11, fontWeight: 'bold' },
  typeIcon: { fontSize: 15 },
  campName: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
  parentText: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right', marginEnd: 30 },
  statusBadge: { fontSize: 9, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusActive: { color: colors.green, borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.1)' },
  statusInactive: { color: colors.muted, borderColor: colors.border, backgroundColor: colors.surface2 },

  statsGrid: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  miniStat: { flex: 1, backgroundColor: colors.surface2, borderRadius: 8, padding: 8, alignItems: 'center' },
  miniStatValue: { fontSize: 13, fontWeight: '900' },
  miniStatLabel: { color: colors.muted, fontSize: 8, marginTop: 2 },

  pctRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 },
  pctLabel: { color: colors.muted, fontSize: 10 },
  pctValue: { fontSize: 10, fontWeight: 'bold' },
  barTrack: { height: 8, backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
});
