import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { fetchDashboardStats, fetchFamilies } from '../lib/supabase';
import Card from '../components/Card';
import Button from '../components/Button';
import { showError } from '../utils/toast';
import spacing from '../theme/spacing';
import typography from '../theme/typography';

const DashboardScreen = ({ navigation }) => {
  const { user, logout, userRole, orgId } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const [stats, setStats] = useState(null);
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;

    try {
      setLoading(true);
      const [statsData, familiesData] = await Promise.all([
        fetchDashboardStats(orgId),
        fetchFamilies(orgId),
      ]);

      setStats(statsData);
      setFamilies(familiesData.slice(0, 5)); // آخر 5 أسر
    } catch (error) {
      console.error('[loadData]', error.message);
      showError('حدث خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    const result = await logout();
    if (!result.success) {
      showError(result.error);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    gradientHeader: {
      paddingTop: spacing.lg,
      paddingBottom: spacing['2xl'],
      paddingHorizontal: spacing.lg,
    },
    headerTitle: {
      ...typography.h1,
      color: '#ffffff',
      marginBottom: spacing.xs,
    },
    headerSubtitle: {
      ...typography.body,
      color: 'rgba(255, 255, 255, 0.8)',
      marginBottom: spacing.xs,
    },
    headerRole: {
      ...typography.bodySmall,
      color: 'rgba(255, 255, 255, 0.7)',
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing['3xl'],
    },
    section: {
      marginBottom: spacing['2xl'],
    },
    sectionTitle: {
      ...typography.h3,
      color: colors.text,
      marginBottom: spacing.lg,
    },
    statsContainer: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    statCard: {
      flex: 1,
      padding: spacing.lg,
      alignItems: 'center',
    },
    statValue: {
      ...typography.h2,
      color: colors.primary,
      marginBottom: spacing.xs,
    },
    statLabel: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    familyCard: {
      marginBottom: spacing.md,
      padding: spacing.lg,
    },
    familyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    familyName: {
      ...typography.body,
      fontWeight: '600',
      color: colors.text,
    },
    familyMeta: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      marginTop: spacing.sm,
    },
    badge: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: spacing.radiusFull,
      backgroundColor: colors.warningLight,
    },
    badgeHigh: {
      backgroundColor: colors.errorLight,
    },
    badgeText: {
      ...typography.labelSmall,
      color: colors.text,
      fontWeight: '600',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing['3xl'],
    },
    emptyText: {
      ...typography.body,
      color: colors.textMuted,
    },
    actionsContainer: {
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    loaderContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    themeToggle: {
      position: 'absolute',
      top: spacing.lg,
      right: spacing.lg,
      zIndex: 10,
    },
  });

  const getRoleLabel = () => {
    const roles = {
      platform_owner: '👑 مسؤول النظام',
      super_admin: '🔐 مسؤول عام',
      camp_delegate: '🏕️ مسؤول مخيم',
      assistant: '📋 مساعد',
    };
    return roles[userRole] || userRole;
  };

  const renderStatCard = (title, value, icon) => (
    <Card variant="elevated" style={styles.statCard}>
      <Text style={{ fontSize: 28, marginBottom: spacing.sm }}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{title}</Text>
    </Card>
  );

  const renderFamilyCard = ({ item }) => (
    <Card style={styles.familyCard}>
      <View style={styles.familyHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.familyName}>{item.name}</Text>
          <Text style={styles.familyMeta}>{item.members_count} أفراد</Text>
        </View>
        <View
          style={[
            styles.badge,
            item.priority === 'high' && styles.badgeHigh,
          ]}
        >
          <Text style={styles.badgeText}>
            {item.priority === 'high' ? '⚠️ عالية' : '📋 عادية'}
          </Text>
        </View>
      </View>
    </Card>
  );

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
      {/* Theme Toggle */}
      <Pressable
        style={styles.themeToggle}
        onPress={toggleTheme}
      >
        <Text style={{ fontSize: 24 }}>{isDark ? '☀️' : '🌙'}</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Gradient Header */}
        <LinearGradient
          colors={[colors.primary, colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientHeader}
        >
          <Text style={styles.headerTitle}>نبض المخيم</Text>
          <Text style={styles.headerSubtitle}>
            أهلاً {user?.email?.split('@')[0]}
          </Text>
          <Text style={styles.headerRole}>{getRoleLabel()}</Text>
        </LinearGradient>

        <View style={styles.content}>
          {/* Stats */}
          <View style={styles.section}>
            <View style={styles.statsContainer}>
              {renderStatCard('الأسر', stats?.totalFamilies || 0, '👨‍👩‍👧‍👦')}
              {renderStatCard('الأفراد', stats?.totalMembers || 0, '👥')}
              {renderStatCard('المخيمات', stats?.totalCamps || 0, '🏕️')}
            </View>
          </View>

          {/* Recent Families */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>الأسر المضافة حديثاً</Text>
            {families.length > 0 ? (
              <FlatList
                data={families}
                renderItem={renderFamilyCard}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => (
                  <View style={{ height: spacing.md }} />
                )}
              />
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>لا توجد أسر مسجلة</Text>
              </View>
            )}
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>الإجراءات السريعة</Text>
            <View style={styles.actionsContainer}>
              <Button
                text="قائمة الأسر"
                variant="primary"
                fullWidth
              />
              <Button
                text="إدارة المخيمات"
                variant="secondary"
                fullWidth
              />
              <Button
                text="تسجيل الخروج"
                variant="danger"
                fullWidth
                onPress={handleLogout}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default DashboardScreen;
