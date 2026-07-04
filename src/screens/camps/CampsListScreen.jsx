import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, SafeAreaView, FlatList, RefreshControl, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Text,
  Card,
  Searchbar,
  Chip,
  FAB,
  ActivityIndicator,
  IconButton,
} from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchCamps, fetchCampFamilyCounts, fetchOrgMembers } from '../../lib/supabase';
import { showError } from '../../utils/toast';
import spacing from '../../theme/spacing';

const STATUS_LABEL = {
  active: { label: '✅ نشط', color: '#10b981' },
  suspended: { label: '⏸️ موقوف', color: '#f59e0b' },
  closed: { label: '🔴 مغلق', color: '#ef4444' },
};

const CampsListScreen = () => {
  const navigation = useNavigation();
  const { orgId, profile } = useAuth();
  const { colors } = useTheme();

  const [camps, setCamps] = useState([]);
  const [familyCounts, setFamilyCounts] = useState({});
  const [orgMembers, setOrgMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const canManageCamps = profile?.role === 'platform_owner' || profile?.role === 'super_admin';

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [campsData, counts, members] = await Promise.all([
        fetchCamps(orgId),
        fetchCampFamilyCounts(orgId),
        fetchOrgMembers(orgId),
      ]);
      setCamps(campsData);
      setFamilyCounts(counts);
      setOrgMembers(members);
    } catch (e) {
      showError('حدث خطأ في تحميل المخيمات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // إعادة تحميل تلقائي عند الرجوع من الإضافة/التعديل
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const toggleCollapse = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // اسم مدير الإيواء لكل مخيم (مع وراثة من المخيم الرئيسي للفروع بلا مدير خاص بها)
  const managerMap = useMemo(() => {
    const byId = Object.fromEntries(orgMembers.map((m) => [m.id, m]));
    const gm = {};
    camps.forEach((c) => {
      const mgr = c.manager_id ? byId[c.manager_id] : null;
      if (mgr?.full_name) gm[c.id] = mgr.full_name;
    });
    camps.forEach((c) => {
      if (c.parent_camp_id && !gm[c.id] && gm[c.parent_camp_id]) gm[c.id] = gm[c.parent_camp_id];
    });
    return gm;
  }, [camps, orgMembers]);

  // اسم المندوب لكل مخيم
  const delegateMap = useMemo(() => {
    const dm = {};
    orgMembers
      .filter((m) => m.role === 'camp_delegate' && m.camp_id)
      .forEach((m) => { dm[m.camp_id] = m.full_name; });
    camps.forEach((c) => {
      if (c.parent_camp_id && !dm[c.id] && dm[c.parent_camp_id]) dm[c.id] = dm[c.parent_camp_id];
    });
    return dm;
  }, [camps, orgMembers]);

  const visibleIds = useMemo(() => new Set(camps.map((c) => c.id)), [camps]);
  const isSearching = !!search.trim();
  const searchLower = search.trim().toLowerCase();

  // هرمي: المخيمات الرئيسية (بلا أب معروف) + فروعها تحتها — مطابق تماماً لمنطق النسخة الأصلية
  const parents = useMemo(() => {
    if (isSearching) return camps.filter((c) => (c.name || '').toLowerCase().includes(searchLower));
    return camps.filter((c) => !c.parent_camp_id || !visibleIds.has(c.parent_camp_id));
  }, [camps, isSearching, searchLower, visibleIds]);

  const childrenOf = useCallback(
    (campId) => (isSearching ? [] : camps.filter((c) => c.parent_camp_id === campId)),
    [camps, isSearching]
  );

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { paddingTop: spacing.lg, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
    headerTitle: { color: '#ffffff', fontWeight: 'bold' },
    headerCount: { color: 'rgba(255,255,255,0.85)', marginTop: spacing.xs },
    searchBar: { marginHorizontal: spacing.lg, marginTop: -spacing.lg, marginBottom: spacing.md, elevation: 3 },
    listContent: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
    parentCard: { marginBottom: spacing.sm, borderRightWidth: 3, borderRightColor: '#f59e0b' },
    subCard: { marginBottom: spacing.sm, marginStart: spacing.xl, borderRightWidth: 3, borderRightColor: colors.primary },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    name: { color: colors.text, fontWeight: 'bold' },
    subName: { color: colors.text, fontWeight: '600', fontSize: 13 },
    metaLine: { fontSize: 11, marginTop: spacing.xs },
    warnLine: { fontSize: 11, marginTop: spacing.xs, color: colors.error, fontWeight: 'bold' },
    mapLink: { fontSize: 11, marginTop: spacing.xs, color: colors.primary },
    collapseToggle: { fontSize: 11, color: colors.primary, marginTop: spacing.xs },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { alignItems: 'center', paddingVertical: spacing['3xl'] },
    fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, backgroundColor: colors.primary },
  });

  const openMap = (lat, lng) => {
    Linking.openURL(`https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`);
  };

  const renderCampInfo = (camp, isSub) => {
    const st = STATUS_LABEL[camp.status] || STATUS_LABEL.active;
    const count = familyCounts[camp.id] || 0;
    const hasManager = !!managerMap[camp.id];
    const hasDelegate = !!delegateMap[camp.id];

    return (
      <>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={isSub ? styles.subName : styles.name}>
              {isSub ? '🏕️ ' : '⛺ '}{camp.name}
            </Text>
            {hasManager ? (
              <Text style={[styles.metaLine, { color: colors.error }]}>🔴 مدير الإيواء: {managerMap[camp.id]}</Text>
            ) : (
              <Text style={styles.warnLine}>⚠️ بلا مدير إيواء معيّن</Text>
            )}
            {hasDelegate ? (
              <Text style={[styles.metaLine, { color: colors.warning }]}>🟠 مندوب: {delegateMap[camp.id]}</Text>
            ) : (
              <Text style={styles.warnLine}>⚠️ بلا مندوب معيّن</Text>
            )}
            {camp.address && <Text style={[styles.metaLine, { color: colors.textSecondary }]}>📍 {camp.address}</Text>}
            <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
              👥 {count} أسرة{camp.capacity ? ` من ${camp.capacity}` : ''}
            </Text>
            {camp.latitude && camp.longitude && (
              <Text style={styles.mapLink} onPress={() => openMap(camp.latitude, camp.longitude)}>
                🗺️ عرض على الخريطة
              </Text>
            )}
          </View>
          <Chip compact mode="flat" textStyle={{ fontSize: 10 }}>{st.label}</Chip>
        </View>
      </>
    );
  };

  const renderParent = ({ item: camp }) => {
    const subs = childrenOf(camp.id);
    const isCollapsed = collapsed.has(camp.id);

    return (
      <View>
        <Card
          mode="elevated"
          style={styles.parentCard}
          onPress={() => canManageCamps && navigation.navigate('CampForm', { campId: camp.id })}
        >
          <Card.Content>
            {renderCampInfo(camp, false)}
            {subs.length > 0 && (
              <Text style={styles.collapseToggle} onPress={() => toggleCollapse(camp.id)}>
                🏕️ {subs.length} فرع {isCollapsed ? '▼' : '▲'}
              </Text>
            )}
          </Card.Content>
        </Card>

        {!isCollapsed && subs.map((s) => (
          <Card
            key={s.id}
            mode="elevated"
            style={styles.subCard}
            onPress={() => canManageCamps && navigation.navigate('CampForm', { campId: s.id })}
          >
            <Card.Content>{renderCampInfo(s, true)}</Card.Content>
          </Card>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text variant="headlineSmall" style={styles.headerTitle}>🏕️ المخيمات</Text>
        <Text variant="bodySmall" style={styles.headerCount}>
          {parents.length} من أصل {camps.length} مخيم
        </Text>
      </LinearGradient>

      <Searchbar
        placeholder="ابحث باسم المخيم"
        value={search}
        onChangeText={setSearch}
        style={styles.searchBar}
      />

      <FlatList
        data={parents}
        keyExtractor={(item) => item.id}
        renderItem={renderParent}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ color: colors.textMuted }}>لا توجد مخيمات مطابقة</Text>
          </View>
        }
      />

      {canManageCamps && (
        <FAB icon="plus" style={styles.fab} onPress={() => navigation.navigate('CampForm')} />
      )}
    </SafeAreaView>
  );
};

export default CampsListScreen;
