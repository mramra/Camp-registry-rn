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
  Menu,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { getFamilyPriority, TIER_LABELS, isIncomplete } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import spacing from '../../theme/spacing';

const TIER_COLOR = {
  urgent: 'error',
  need: 'warning',
  ok: 'success',
};

const FamiliesListScreen = () => {
  const navigation = useNavigation();
  const { orgId, profile } = useAuth();
  const { colors } = useTheme();

  const canAdd = profile?.role === 'platform_owner' || profile?.can_add;

  const [families, setFamilies] = useState([]);
  const [membersByFamily, setMembersByFamily] = useState({});
  const [allMembers, setAllMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [search, setSearch] = useState('');
  const [campFilter, setCampFilter] = useState(null);
  const [qualityFilter, setQualityFilter] = useState(''); // '', 'incomplete', 'dup_id', 'dup_phone'
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
      setAllMembers(members);
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

  // كشف التكرار (هوية/جوال) — نفس منطق النسخة الأصلية بالضبط
  const { dupIdSet, dupPhoneSet } = useMemo(() => {
    const idToFams = {};
    families.forEach((f) => {
      if (f.head_id) {
        if (!idToFams[f.head_id]) idToFams[f.head_id] = new Set();
        idToFams[f.head_id].add(f.id);
      }
    });
    allMembers.forEach((m) => {
      if (m.national_id && m.family_id) {
        if (!idToFams[m.national_id]) idToFams[m.national_id] = new Set();
        idToFams[m.national_id].add(m.family_id);
      }
    });
    const dupIdSet = new Set();
    families.forEach((f) => {
      if (f.head_id && (idToFams[f.head_id]?.size || 0) > 1) dupIdSet.add(f.id);
      (membersByFamily[f.id] || []).forEach((m) => {
        if (m.national_id && (idToFams[m.national_id]?.size || 0) > 1) dupIdSet.add(f.id);
      });
    });

    const cleanPh = (p) => (p || '').replace(/\s/g, '');
    const phCount = {};
    families.forEach((f) => {
      if (f.phone1) {
        const p = cleanPh(f.phone1);
        phCount[p] = (phCount[p] || 0) + 1;
      }
    });
    const dupPhoneSet = new Set(
      families.filter((f) => f.phone1 && (phCount[cleanPh(f.phone1)] || 0) > 1).map((f) => f.id)
    );

    return { dupIdSet, dupPhoneSet };
  }, [families, allMembers, membersByFamily]);

  const incompleteCount = useMemo(
    () => families.filter((f) => isIncomplete(f, membersByFamily[f.id])).length,
    [families, membersByFamily]
  );

  const filteredFamilies = useMemo(() => {
    let list = families;

    if (qualityFilter === 'incomplete') list = list.filter((f) => isIncomplete(f, membersByFamily[f.id]));
    else if (qualityFilter === 'dup_id') list = list.filter((f) => dupIdSet.has(f.id));
    else if (qualityFilter === 'dup_phone') list = list.filter((f) => dupPhoneSet.has(f.id));

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          (f.head_name || '').toLowerCase().includes(q) ||
          (f.head_id || '').includes(q) ||
          (f.phone1 || '').includes(q)
      );
    }
    return list;
  }, [families, search, qualityFilter, membersByFamily, dupIdSet, dupPhoneSet]);

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
      flexWrap: 'wrap',
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
    warnMeta: { color: colors.error, marginTop: spacing.xs },
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
    const incomplete = isIncomplete(item, membersByFamily[item.id]);
    const isDupId = dupIdSet.has(item.id);
    const isDupPhone = dupPhoneSet.has(item.id);

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
              {(incomplete || isDupId || isDupPhone) && (
                <Text variant="bodySmall" style={styles.warnMeta}>
                  {incomplete ? '⚠️ ناقص  ' : ''}
                  {isDupId ? '🔁 هوية مكررة  ' : ''}
                  {isDupPhone ? '📞 جوال مكرر' : ''}
                </Text>
              )}
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
        <Chip
          selected={qualityFilter === ''}
          mode={qualityFilter === '' ? 'flat' : 'outlined'}
          onPress={() => setQualityFilter('')}
        >
          الكل ({families.length})
        </Chip>
        <Chip
          selected={qualityFilter === 'incomplete'}
          mode={qualityFilter === 'incomplete' ? 'flat' : 'outlined'}
          onPress={() => setQualityFilter(qualityFilter === 'incomplete' ? '' : 'incomplete')}
        >
          ⚠️ ناقص ({incompleteCount})
        </Chip>
        <Chip
          selected={qualityFilter === 'dup_id'}
          mode={qualityFilter === 'dup_id' ? 'flat' : 'outlined'}
          onPress={() => setQualityFilter(qualityFilter === 'dup_id' ? '' : 'dup_id')}
        >
          🔁 هوية مكررة ({dupIdSet.size})
        </Chip>
        <Chip
          selected={qualityFilter === 'dup_phone'}
          mode={qualityFilter === 'dup_phone' ? 'flat' : 'outlined'}
          onPress={() => setQualityFilter(qualityFilter === 'dup_phone' ? '' : 'dup_phone')}
        >
          📞 جوال مكرر ({dupPhoneSet.size})
        </Chip>

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

      {canAdd && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => navigation.navigate('FamilyForm')}
        />
      )}
    </SafeAreaView>
  );
};

export default FamiliesListScreen;
