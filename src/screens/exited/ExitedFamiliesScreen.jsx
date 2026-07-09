import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { fetchExitedFamilies, fetchCamps, reinstateExitedFamily } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import colors from '../../theme/colors';

export default function ExitedFamiliesScreen() {
  const { orgId, isOwner } = useAuth();
  const [families, setFamilies] = useState([]);
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reinstatingId, setReinstatingId] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [exited, campsData] = await Promise.all([fetchExitedFamilies(orgId), fetchCamps(orgId)]);
      setFamilies(exited);
      setCamps(campsData);
    } catch (e) {
      showError('تعذّر تحميل الأسر الخارجة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = () => { setRefreshing(true); loadData(); };
  const campMap = Object.fromEntries(camps.map((c) => [c.id, c.name]));

  const handleReinstate = async (family) => {
    setReinstatingId(family.id);
    try {
      const result = await reinstateExitedFamily(family.id);
      if (result.success) {
        showSuccess(`تم إرجاع "${family.head_name}" للقائمة العادية`);
        loadData();
      } else {
        showError(result.error || 'فشل الإرجاع');
      }
    } finally {
      setReinstatingId(null);
    }
  };

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.screen}>
        <EmptyState icon="🔒" title="هذه الشاشة لمالك المنصة فقط" />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const renderFamily = ({ item: f }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.familyName}>{f.head_name || '—'}</Text>
          {!!f.head_id && <Text style={styles.familyId}>🪪 {f.head_id}</Text>}
          <Text style={styles.metaText}>🏕️ كان بمخيم: {campMap[f.camp_id] || '—'}</Text>
          {!!f.phone1 && <Text style={styles.metaText}>📞 {f.phone1}</Text>}
        </View>
        <Text style={styles.exitDate}>🚪 {formatDate(f.exit_date)}</Text>
      </View>
      {!!f.exit_reason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonText}>{f.exit_reason}</Text>
        </View>
      )}
      <Pressable
        style={[styles.reinstateBtn, reinstatingId === f.id && { opacity: 0.6 }]}
        onPress={() => handleReinstate(f)}
        disabled={reinstatingId === f.id}
      >
        {reinstatingId === f.id ? (
          <ActivityIndicator color={colors.green} size="small" />
        ) : (
          <Text style={styles.reinstateBtnText}>↩️ إرجاع للقائمة العادية</Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={families}
        keyExtractor={(item) => item.id}
        renderItem={renderFamily}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <PageHeader
            icon="🚪"
            title="الأسر الخارجة"
            subtitle={<Text style={styles.headerSubtitle}>{families.length} أسرة — لا تظهر بالقوائم العادية</Text>}
          />
        }
        ListEmptyComponent={<EmptyState icon="🚪" title="لا توجد أسر خارجة حالياً" />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRightWidth: 3, borderRightColor: colors.red, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  familyName: { color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'right' },
  familyId: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
  metaText: { color: colors.muted, fontSize: 11, marginTop: 3, textAlign: 'right' },
  exitDate: { color: colors.red, fontWeight: 'bold', fontSize: 11 },

  reasonBox: { backgroundColor: colors.surface2, borderRadius: 8, padding: 8, marginTop: 10 },
  reasonText: { color: colors.muted, fontSize: 11, textAlign: 'right' },

  reinstateBtn: { backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginTop: 10 },
  reinstateBtnText: { color: colors.green, fontWeight: 'bold', fontSize: 12 },
});
