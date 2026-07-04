import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, Card, Button, ActivityIndicator, Badge } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { fetchDashboardStats, fetchFamilies } from '../lib/supabase';
import { getFamilyPriority, TIER_LABELS } from '../lib/helpers';
import { showError } from '../utils/toast';
import spacing from '../theme/spacing';

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
      color: '#ffffff',
      marginBottom: spacing.xs,
      fontWeight: 'bold',
    },
    headerSubtitle: {
      color: 'rgba(255, 255, 255, 0.85)',
      marginBottom: spacing.xs,
    },
    headerRole: {
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
      color: colors.text,
      marginBottom: spacing.lg,
      fontWeight: 'bold',
    },
    statsContainer: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    statCard: {
      flex: 1,
    },
    statCardContent: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    statValue: {
      color: colors.primary,
      marginBottom: spacing.xs,
      fontWeight: 'bold',
    },
    statLabel: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    familyCard: {
      marginBottom: spacing.md,
    },
    familyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    familyName: {
      color: colors.text,
      fontWeight: '600',
    },
    familyMeta: {
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing['3xl'],
    },
    emptyText: {
      color: colors.textMuted,
    },
    actionsContainer: {
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    actionButton: {
      borderRadius: 8,
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
    <Card mode="elevated" style={styles.statCard}>
      <Card.Content style={styles.statCardContent}>
        <Text style={{ fontSize: 28, marginBottom: spacing.sm }}>{icon}</Text>
        <Text variant="headlineSmall" style={styles.statValue}>{value}</Text>
        <Text variant="bodySmall" style={styles.statLabel}>{title}</Text>
      </Card.Content>
    </Card>
  );

  const renderFamilyCard = ({ item }) => {
    const priority = getFamilyPriority(item, []);
    return (
      <Card mode="elevated" style={styles.familyCard}>
        <Card.Content style={styles.familyHeader}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyLarge" style={styles.familyName}>{item.head_name || '—'}</Text>
            <Text variant="bodySmall" style={styles.familyMeta}>{item.head_id || ''}</Text>
          </View>
          <Badge
            style={{
              backgroundColor: priority.tier === 'urgent' ? colors.errorLight : priority.tier === 'need' ? colors.warningLight : colors.successLight,
              color: colors.text,
            }}
            size={26}
          >
            {TIER_LABELS[priority.tier]}
          </Badge>
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
          <Text variant="headlineMedium" style={styles.headerTitle}>نبض المخيم</Text>
          <Text variant="bodyMedium" style={styles.headerSubtitle}>
            أهلاً {user?.email?.split('@')[0]}
          </Text>
          <Text variant="bodySmall" style={styles.headerRole}>{getRoleLabel()}</Text>
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
            <Text variant="titleMedium" style={styles.sectionTitle}>الأسر المضافة حديثاً</Text>
            {families.length > 0 ? (
              families.map((item, index) => (
                <View key={item.id}>
                  {renderFamilyCard({ item })}
                  {index < families.length - 1 && <View style={{ height: spacing.md }} />}
                </View>
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>لا توجد أسر مسجلة</Text>
              </View>
            )}
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text variant="titleMedium" style={styles.sectionTitle}>الإجراءات السريعة</Text>
            <View style={styles.actionsContainer}>
              <Button
                mode="contained"
                style={styles.actionButton}
                onPress={() => navigation.navigate('FamiliesList')}
              >
                قائمة الأسر
              </Button>
              <Button
                mode="outlined"
                style={styles.actionButton}
                onPress={() => navigation.navigate('CampsList')}
              >
                إدارة المخيمات
              </Button>
              <Button
                mode="contained-tonal"
                buttonColor={colors.errorLight}
                textColor={colors.error}
                style={styles.actionButton}
                onPress={handleLogout}
              >
                تسجيل الخروج
              </Button>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default DashboardScreen;
