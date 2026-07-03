import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { Text, Card, ActivityIndicator, Divider, Chip } from 'react-native-paper';
import { useRoute } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { supabase, fetchFamilyMembers } from '../../lib/supabase';
import { getFamilyPriority, TIER_LABELS, getFamilyCategories, CATEGORY_LABELS } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import spacing from '../../theme/spacing';

const FamilyDetailScreen = () => {
  const route = useRoute();
  const { familyId } = route.params || {};
  const { colors } = useTheme();
  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('families')
          .select('*')
          .eq('id', familyId)
          .single();
        if (error) throw error;
        setFamily(data);
        const mems = await fetchFamilyMembers([familyId]);
        setMembers(mems);
      } catch (e) {
        showError('تعذّر تحميل بيانات الأسرة');
      } finally {
        setLoading(false);
      }
    };
    if (familyId) load();
  }, [familyId]);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg },
    card: { marginBottom: spacing.lg },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
    },
    label: { color: colors.textSecondary },
    value: { color: colors.text, fontWeight: '600' },
    sectionTitle: { color: colors.text, marginBottom: spacing.md, fontWeight: 'bold' },
    memberCard: { marginBottom: spacing.sm },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!family) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <Text style={{ color: colors.textMuted }}>لم يتم العثور على الأسرة</Text>
        </View>
      </SafeAreaView>
    );
  }

  const priority = getFamilyPriority(family, members);
  const categories = getFamilyCategories(family, members);

  const infoRows = [
    ['رقم الهوية', family.head_id],
    ['الجوال', family.phone1],
    ['جوال إضافي', family.phone2],
    ['الحالة الاجتماعية', family.head_marital],
    ['الجنس', family.head_gender],
    ['العنوان الأصلي', family.original_address],
    ['ملاحظات', family.notes],
  ].filter(([, v]) => v);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.value}>{family.head_name}</Text>
            <View style={styles.chipsRow}>
              <Chip compact mode="flat">{TIER_LABELS[priority.tier]}</Chip>
              {categories.map((c) => (
                <Chip key={c} compact mode="outlined">{CATEGORY_LABELS[c] || c}</Chip>
              ))}
            </View>
          </Card.Content>
        </Card>

        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>بيانات رب الأسرة</Text>
            {infoRows.map(([label, value], i) => (
              <React.Fragment key={label}>
                <View style={styles.row}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.value}>{value}</Text>
                </View>
                {i < infoRows.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </Card.Content>
        </Card>

        <Text variant="titleMedium" style={styles.sectionTitle}>
          أفراد الأسرة ({members.length})
        </Text>
        {members.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>لا يوجد أفراد مسجلون</Text>
        ) : (
          members.map((m) => (
            <Card key={m.id} mode="elevated" style={styles.memberCard}>
              <Card.Content>
                <View style={styles.row}>
                  <Text style={styles.value}>{m.name}</Text>
                  <Text style={styles.label}>{m.relation}</Text>
                </View>
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default FamilyDetailScreen;
