import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Linking,
  Alert,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchCamps, fetchCampFamilyCounts, fetchOrgMembers, deleteCamp } from '../../lib/supabase';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import EmptyState from '../../components/ui/EmptyState';
import colors from '../../theme/colors';

const STATUS_MAP = {
  active: { label: '✅ نشط', color: colors.green },
  suspended: { label: '⏸️ موقوف', color: colors.accent },
  closed: { label: '🔴 مغلق', color: colors.red },
};

export default function CampsListScreen() {
  const navigation = useNavigation();
  const { profile, orgId, isOwner, isSuperAdmin, isCampDelegate } = useAuth();
  const { getVisibleCamps } = useDataScope();

  const [camps, setCamps] = useState([]);
  const [famCount, setFamCount] = useState({});
  const [orgMembers, setOrgMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    // 1) اعرض النسخة المحفوظة فوراً (لو موجودة) — بدون انتظار الشبكة.
    const cached = await getCachedData('camps_list', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      setCamps(cached.data.camps || []);
      setFamCount(cached.data.famCount || {});
      setOrgMembers(cached.data.orgMembers || []);
      setOfflineInfo({ savedAt: cached.savedAt });
      setLoading(false);
    }

    // 2) بعدين حاول تحديث حي بالخلفية.
    try {
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) {
        if (!hadCache) showError('لا يوجد اتصال ولا توجد بيانات محفوظة');
        return;
      }

      const [campsData, counts, members] = await withTimeout(
        Promise.all([fetchCamps(orgId), fetchCampFamilyCounts(orgId), fetchOrgMembers(orgId)]),
        12000,
        'انتهت مهلة تحميل البيانات'
      );
      setCamps(campsData);
      setFamCount(counts);
      setOrgMembers(members);
      setOfflineInfo(null);
      cacheData('camps_list', profile?.id, { camps: campsData, famCount: counts, orgMembers: members });
    } catch (e) {
      if (!hadCache) showError('تعذّر تحميل البيانات ولا توجد نسخة محفوظة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const toggleCollapse = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── خرائط المندوب/مدير الإيواء لكل مخيم (بالوراثة من الرئيسي للفروع) ──
  const managerMap = useMemo(() => {
    const byId = Object.fromEntries(orgMembers.map((m) => [m.id, m]));
    const map = {};
    camps.forEach((c) => {
      const mgr = c.manager_id ? byId[c.manager_id] : null;
      if (mgr?.full_name) map[c.id] = mgr.full_name;
    });
    camps.forEach((c) => {
      if (c.parent_camp_id && !map[c.id] && map[c.parent_camp_id]) map[c.id] = map[c.parent_camp_id];
    });
    return map;
  }, [camps, orgMembers]);

  const delegateMap = useMemo(() => {
    const map = {};
    orgMembers
      .filter((m) => m.role === 'camp_delegate' && m.camp_id)
      .forEach((m) => { map[m.camp_id] = m.full_name; });
    camps.forEach((c) => {
      if (c.parent_camp_id && !map[c.id] && map[c.parent_camp_id]) map[c.id] = map[c.parent_camp_id];
    });
    return map;
  }, [camps, orgMembers]);

  const visibleCamps = useMemo(() => getVisibleCamps(camps), [camps, getVisibleCamps]);

  const isSearching = !!search.trim();
  const searchLower = search.trim().toLowerCase();

  const parents = useMemo(() => {
    const base = visibleCamps;
    if (isSearching) return base.filter((c) => (c.name || '').toLowerCase().includes(searchLower));
    const visibleIds = new Set(base.map((c) => c.id));
    return base.filter((c) => !c.parent_camp_id || !visibleIds.has(c.parent_camp_id));
  }, [visibleCamps, isSearching, searchLower]);

  const childrenOf = useCallback(
    (campId) => (isSearching ? [] : camps.filter((c) => c.parent_camp_id === campId)),
    [camps, isSearching]
  );

  const canEditCamp = (camp) =>
    isOwner || isSuperAdmin || (isCampDelegate && profile?.camp_id === camp.id);

  const canDeleteCamp = (camp, subCount) =>
    canEditCamp(camp) && (famCount[camp.id] || 0) === 0 && subCount === 0;

  const openMap = (lat, lng) => {
    Linking.openURL(`https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`);
  };

  const handleDelete = (camp) => {
    Alert.alert('حذف المخيم', `هل تريد حذف "${camp.name}" نهائياً؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteCamp(camp.id, camp, { ...profile, org_id: orgId });
          if (result.success) {
            showSuccess('تم حذف المخيم');
            loadData();
          } else {
            showError(result.error || 'فشل الحذف');
          }
        },
      },
    ]);
  };

  const renderCampInfo = (camp, isSub, subCount) => {
    const st = STATUS_MAP[camp.status] || { label: camp.status || '—', color: colors.muted };
    const count = famCount[camp.id] || 0;
    const editable = canEditCamp(camp);
    const deletable = canDeleteCamp(camp, subCount);

    return (
      <View>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={isSub ? styles.subName : styles.mainName}>
              {isSub ? '🏕️ ' : '⛺ '}{camp.name}
            </Text>

            {managerMap[camp.id] ? (
              <Text style={styles.managerLine}>🔴 مدير الإيواء: {managerMap[camp.id]}</Text>
            ) : (
              <Text style={styles.warnLine}>⚠️ بلا مدير إيواء معيّن</Text>
            )}
            {delegateMap[camp.id] ? (
              <Text style={styles.delegateLine}>🟠 مندوب: {delegateMap[camp.id]}</Text>
            ) : (
              <Text style={styles.warnLine}>⚠️ بلا مندوب معيّن</Text>
            )}
            {!!camp.address && <Text style={styles.metaLine}>📍 {camp.address}</Text>}

            <Text style={styles.metaLine}>
              👥 {count} أسرة{camp.capacity ? ` من ${camp.capacity}` : ''}
              {!isSub && subCount > 0 && (
                <Text style={styles.collapseToggle} onPress={() => toggleCollapse(camp.id)}>
                  {'  •  🏕️ '}{subCount} فرع {collapsed.has(camp.id) ? '▼' : '▲'}
                </Text>
              )}
            </Text>

            {!!camp.latitude && !!camp.longitude && (
              <Text style={styles.mapLink} onPress={() => openMap(camp.latitude, camp.longitude)}>
                🗺️ عرض على الخريطة
              </Text>
            )}
          </View>
          <Text style={[styles.statusLabel, { color: st.color }]}>{st.label}</Text>
        </View>

        {(editable || deletable) && !offlineInfo && (
          <View style={styles.actionsRow}>
            {editable && (
              <Pressable style={styles.editBtn} onPress={() => navigation.push('CampForm', { campId: camp.id })}>
                <Text style={styles.editBtnText}>✏️ تعديل</Text>
              </Pressable>
            )}
            {!isSub && (isOwner || isSuperAdmin) && (
              <Pressable
                style={styles.addSubBtn}
                onPress={() => navigation.push('CampForm', { parentCampId: camp.id })}
              >
                <Text style={styles.addSubBtnText}>➕ فرع</Text>
              </Pressable>
            )}
            {deletable && (
              <Pressable style={styles.deleteBtn} onPress={() => handleDelete(camp)}>
                <Text style={styles.deleteBtnText}>🗑️ حذف</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderParent = ({ item: camp }) => {
    const subs = childrenOf(camp.id);
    const isCollapsed = collapsed.has(camp.id);

    return (
      <View>
        <View style={[styles.card, styles.mainCard]}>{renderCampInfo(camp, false, subs.length)}</View>
        {!isCollapsed &&
          subs.map((s) => (
            <View key={s.id} style={styles.treeRow}>
              <View style={styles.treeGuide} />
              <View style={[styles.card, styles.subCard, { flex: 1 }]}>
                <Text style={styles.treeConnector}>└─ فرع تابع</Text>
                {renderCampInfo(s, true, 0)}
              </View>
            </View>
          ))}
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
        data={parents}
        keyExtractor={(item) => item.id}
        renderItem={renderParent}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="🏕️"
              title="المخيمات"
              subtitle={<Text style={styles.headerSubtitle}>{parents.length} من أصل {camps.length} مخيم</Text>}
            />
            {(isOwner || isSuperAdmin) && !offlineInfo && (
              <PrimaryButton label="➕ إضافة مخيم" onPress={() => navigation.push('CampForm')} />
            )}
            {!!offlineInfo && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة (لا يمكن الإضافة/التعديل/الحذف الآن)
                </Text>
              </View>
            )}
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث باسم المخيم..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="🏕️" title="لا توجد مخيمات مطابقة" />}
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
    marginBottom: 12,
  },

  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  mainCard: { backgroundColor: colors.surface, borderRightWidth: 3, borderRightColor: colors.accent },
  subCard: { backgroundColor: colors.surface, borderRightWidth: 3, borderRightColor: colors.blue, marginBottom: 0 },
  treeRow: { flexDirection: 'row-reverse', marginBottom: 8 },
  treeGuide: { width: 22, borderRightWidth: 1, borderRightColor: colors.border },
  treeConnector: { color: colors.muted, fontSize: 10, textAlign: 'right', marginBottom: 4 },

  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  mainName: { color: colors.white, fontWeight: '900', fontSize: 14, textAlign: 'right' },
  subName: { color: colors.white, fontWeight: 'bold', fontSize: 12, textAlign: 'right' },
  managerLine: { color: colors.red, fontSize: 11, marginTop: 3, textAlign: 'right' },
  delegateLine: { color: colors.accent, fontSize: 11, marginTop: 2, textAlign: 'right' },
  warnLine: { color: colors.red, fontSize: 11, fontWeight: 'bold', marginTop: 3, textAlign: 'right' },
  metaLine: { color: colors.muted, fontSize: 10, marginTop: 3, textAlign: 'right' },
  collapseToggle: { color: colors.blue, fontWeight: 'bold' },
  mapLink: { color: colors.blue, fontSize: 10, marginTop: 4, textAlign: 'right' },
  statusLabel: { fontSize: 10, fontWeight: 'bold' },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  editBtn: { backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { color: colors.blue, fontWeight: 'bold', fontSize: 11 },
  addSubBtn: { backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addSubBtnText: { color: colors.green, fontWeight: 'bold', fontSize: 11 },
  deleteBtn: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  deleteBtnText: { color: colors.red, fontWeight: 'bold', fontSize: 11 },
});
