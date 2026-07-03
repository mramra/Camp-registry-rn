import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Text,
  Card,
  Searchbar,
  Chip,
  FAB,
  ActivityIndicator,
  IconButton,
  Menu,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { getFamilyPriority, TIER_LABELS } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import spacing from '../../theme/spacing';

const TIER_COLOR = {
  urgent: 'error',
  need: 'warning',
  ok: 'success',
};

const FamiliesListScreen = () => {
  const navigation = useNavigation();
  const { orgId } = useAuth();
  const { colors } = useTheme();

  const [families, setFamilies] = useState([]);
  const [membersByFamily, setMembersByFamily] = useState({});
  const [camps, setCamps] = useState([]);
  const [search, setSearch] = useState('');
  const [campFilter, setCampFilter] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [familiesData, campsData] = await Promise.all([
        fetchFamilies(orgId, campFilter),
        fetchCamps(orgId),
      ]);
      setFamilies(familiesData);
      setCamps(campsData);

      const ids = familiesData.map((f) => f.id);
      const members = await fetchFamilyMembers(ids);
      const grouped = {};
      members.forEach((m) => {
        if (!grouped[m.family_id]) grouped[m.family_id] = [];
        grouped[m.family_id].push(m);
      });
      setMembersByFamily(grouped);
    } catch (e) {
      showError('حدث خطأ في تحميل الأسر');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, campFilter]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const campMap = useMemo(() => {
    const map = {};
    camps.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [camps]);

  const filteredFamilies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return families;
    return families.filter(
      (f) =>
        (f.head_name || '').toLowerCase().includes(q) ||
        (f.head_id || '').includes(q) ||
        (f.phone1 || '').includes(q)
    );
  }, [families, search]);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
    headerTitle: { color: '#ffffff', fontWeight: 'bold' },
    headerCount: { color: 'rgba(255,255,255,0.85)', marginTop: spacing.xs },
    searchBar: {
      marginHorizontal: spacing.lg,
      marginTop: -spacing.lg,
      marginBottom: spacing.md,
      elevation: 3,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: 100,
    },
    card: { marginBottom: spacing.md },
    cardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    name: { color: colors.text, fontWeight: '600' },
    meta: { color: colors.textSecondary, marginTop: spacing.xs },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { alignItems: 'center', paddingVertical: spacing['3xl'] },
    fab: {
      position: 'absolute',
      right: spacing.lg,
      bottom: spacing.lg,
      backgroundColor: colors.primary,
    },
  });

  const renderFamily = ({ item }) => {
    const priority = getFamilyPriority(item, membersByFamily[item.id]);
    const memberCount = 1 + (membersByFamily[item.id]?.length || 0);

    return (
      <Card
        mode="elevated"
        style={styles.card}
        onPress={() => navigation.navigate('FamilyDetail', { familyId: item.id })}
      >
        <Card.Content>
          <View style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyLarge" style={styles.name}>{item.head_name || '—'}</Text>
              <Text variant="bodySmall" style={styles.meta}>
                {item.head_id ? `${item.head_id} · ` : ''}{memberCount} أفراد · {campMap[item.camp_id] || 'بدون مخيم'}
              </Text>
            </View>
            <Chip
              compact
              mode="flat"
              style={{ backgroundColor: colors[`${TIER_COLOR[priority.tier]}Light`] }}
              textStyle={{ color: colors[TIER_COLOR[priority.tier]], fontSize: 11 }}
            >
              {TIER_LABELS[priority.tier]}
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
        <Text variant="headlineSmall" style={styles.headerTitle}>الأسر</Text>
        <Text variant="bodySmall" style={styles.headerCount}>
          {filteredFamilies.length} من أصل {families.length} أسرة
        </Text>
      </LinearGradient>

      <Searchbar
        placeholder="ابحث بالاسم، رقم الهوية، أو الجوال"
        value={search}
        onChangeText={setSearch}
        style={styles.searchBar}
      />

      <View style={styles.filterRow}>
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <Chip
              icon="filter-variant"
              mode="outlined"
              onPress={() => setMenuVisible(true)}
            >
              {campFilter ? campMap[campFilter] : 'كل المخيمات'}
            </Chip>
          }
        >
          <Menu.Item
            title="كل المخيمات"
            onPress={() => { setCampFilter(null); setMenuVisible(false); }}
          />
          {camps.map((c) => (
            <Menu.Item
              key={c.id}
              title={c.name}
              onPress={() => { setCampFilter(c.id); setMenuVisible(false); }}
            />
          ))}
        </Menu>
      </View>

      <FlatList
        data={filteredFamilies}
        keyExtractor={(item) => item.id}
        renderItem={renderFamily}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ color: colors.textMuted }}>لا توجد أسر مطابقة</Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('FamilyForm')}
      />
    </SafeAreaView>
  );
};

export default FamiliesListScreen;
