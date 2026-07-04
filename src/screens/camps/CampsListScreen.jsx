import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, SafeAreaView, FlatList, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Text,
  Card,
  Searchbar,
  Chip,
  FAB,
  ActivityIndicator,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchCamps, fetchCampFamilyCounts, fetchOrgMembers } from '../../lib/supabase';
import { showError } from '../../utils/toast';
import spacing from '../../theme/spacing';

const STATUS_LABEL = {
  active: { label: '✅ نشط', tone: 'success' },
  suspended: { label: '⏸️ موقوف', tone: 'warning' },
  closed: { label: '🔴 مغلق', tone: 'error' },
};

const CampsListScreen = () => {
  const navigation = useNavigation();
  const { orgId, profile } = useAuth();
  const { colors } = useTheme();

  const [camps, setCamps] = useState([]);
  const [familyCounts, setFamilyCounts] = useState({});
  const [orgMembers, setOrgMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // إدارة المخيمات (هيكل إداري) محصورة حالياً بمالك المنصة ومدير الإيواء —
  // نفس القيد بالنسخة الأصلية؛ صلاحيات المندوب لإضافة فرع تحت مخيمه لم تُنقل
  // بعد بهذه النسخة الأولى (خطوة قادمة عند الحاجة).
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

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // اسم مدير الإيواء لكل مخيم (camps.manager_id → org_members.id)
  // مع وراثة من المخيم الرئيسي للفروع بلا مدير خاص بها (نفس منطق النسخة الأصلية)
  const managerMap = useMemo(() => {
    const byId = Object.fromEntries(orgMembers.map((m) => [m.id, m]));
    const gm = {};
    camps.forEach((c) => {
      const mgr = c.manager_id ? byId[c.manager_id] : null;
      if (mgr?.full_name) gm[c.id] = mgr.full_name;
    });
    camps.forEach((c) => {
      if (c.parent_camp_id && !gm[c.id] && gm[c.parent_camp_id]) {
        gm[c.id] = gm[c.parent_camp_id];
      }
    });
    return gm;
  }, [camps, orgMembers]);

  // اسم مندوب المخيم (org_members حيث role=camp_delegate وcamp_id=هذا المخيم)
  const delegateMap = useMemo(() => {
    const dm = {};
    orgMembers
      .filter((m) => m.role === 'camp_delegate' && m.camp_id)
      .forEach((m) => {
        dm[m.camp_id] = m.full_name;
      });
    camps.forEach((c) => {
      if (c.parent_camp_id && !dm[c.id] && dm[c.parent_camp_id]) {
        dm[c.id] = dm[c.parent_camp_id];
      }
    });
    return dm;
  }, [camps, orgMembers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return camps;
    return camps.filter((c) => (c.name || '').toLowerCase().includes(q));
  }, [camps, search]);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { paddingTop: spacing.lg, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
    headerTitle: { color: '#ffffff', fontWeight: 'bold' },
    headerCount: { color: 'rgba(255,255,255,0.85)', marginTop: spacing.xs },
    searchBar: { marginHorizontal: spacing.lg, marginTop: -spacing.lg, marginBottom: spacing.md, elevation: 3 },
    listContent: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
    card: { marginBottom: spacing.md },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    name: { color: colors.text, fontWeight: '600' },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    meta: { color: colors.textSecondary },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { alignItems: 'center', paddingVertical: spacing['3xl'] },
    fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, backgroundColor: colors.primary },
  });

  const renderCamp = ({ item }) => {
    const st = STATUS_LABEL[item.status] || STATUS_LABEL.active;
    const count = familyCounts[item.id] || 0;

    return (
      <Card
        mode="elevated"
        style={styles.card}
        onPress={() => canManageCamps && navigation.navigate('CampForm', { campId: item.id })}
      >
        <Card.Content>
          <View style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyLarge" style={styles.name}>
                {item.camp_type === 'sub' ? '↳ ' : ''}
                {item.name}
              </Text>
              <View style={styles.subRow}>
                <Text variant="bodySmall" style={styles.meta}>
                  {count} أسرة{item.capacity ? ` · السعة ${item.capacity}` : ''}
                </Text>
              </View>
              {(delegateMap[item.id] || managerMap[item.id]) && (
                <Text variant="bodySmall" style={styles.meta}>
                  {delegateMap[item.id] ? `👤 المندوب: ${delegateMap[item.id]}` : ''}
                  {managerMap[item.id] ? `  🏢 المدير: ${managerMap[item.id]}` : ''}
                </Text>
              )}
            </View>
            <Chip compact mode="flat">
              {st.label}
            </Chip>
          </View>
        </Card.Content>
      </Card>
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
          {filtered.length} من أصل {camps.length} مخيم
        </Text>
      </LinearGradient>

      <Searchbar
        placeholder="ابحث باسم المخيم"
        value={search}
        onChangeText={setSearch}
        style={styles.searchBar}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderCamp}
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
