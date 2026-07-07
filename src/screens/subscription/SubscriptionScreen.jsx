import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import FormSection from '../../components/ui/FormSection';
import colors from '../../theme/colors';

const PLANS = [
  { name: 'مجاني', price: '0 ر.س', period: 'دائماً', accent: false },
  { name: 'Pro', price: '99 ر.س', period: 'شهرياً', accent: true, badge: 'موصى به' },
];

const FEATURES = [
  { icon: '👥', name: 'عدد المستخدمين', free: 'حتى 3', pro: 'غير محدود' },
  { icon: '👨‍👩‍👧‍👦', name: 'عدد الأسر', free: 'حتى 100', pro: 'غير محدود' },
  { icon: '🏕️', name: 'عدد المخيمات', free: 'مخيم 1', pro: 'غير محدود' },
  { icon: '💾', name: 'تصدير البيانات', free: '❌', pro: '✅' },
  { icon: '💬', name: 'رسائل SMS', free: '❌', pro: '✅' },
  { icon: '📈', name: 'التقارير المتقدمة', free: 'محدودة', pro: 'كاملة' },
  { icon: '🔒', name: 'الدعم الفني', free: 'مجتمع', pro: 'أولوية' },
];

export default function SubscriptionScreen() {
  const { isOwner } = useAuth();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader icon="💎" title="الاشتراك والباقات" />

        <View style={styles.plansRow}>
          {PLANS.map((plan) => (
            <View key={plan.name} style={[styles.planCard, plan.accent && styles.planCardAccent]}>
              {!!plan.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{plan.badge}</Text>
                </View>
              )}
              <Text style={[styles.planName, plan.accent && { color: colors.accent }]}>{plan.name}</Text>
              <Text style={styles.planPrice}>{plan.price}</Text>
              <Text style={styles.planPeriod}>{plan.period}</Text>
            </View>
          ))}
        </View>

        <FormSection title="📊 مقارنة الباقات">
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colFeature]}>الميزة</Text>
            <Text style={[styles.tableHeaderCell, styles.colValue]}>مجاني</Text>
            <Text style={[styles.tableHeaderCell, styles.colValue, { color: colors.accent }]}>Pro</Text>
          </View>
          {FEATURES.map((f, i) => (
            <View key={f.name} style={[styles.tableRow, i === FEATURES.length - 1 && styles.tableRowLast]}>
              <View style={[styles.colFeature, styles.featureCell]}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={styles.featureName}>{f.name}</Text>
              </View>
              <Text style={[styles.tableCell, styles.colValue]}>{f.free}</Text>
              <Text style={[styles.tableCell, styles.colValue, styles.proValue]}>{f.pro}</Text>
            </View>
          ))}
        </FormSection>

        {isOwner && (
          <Pressable style={styles.upgradeBtn}>
            <Text style={styles.upgradeBtnText}>🚀 الترقية إلى Pro</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  plansRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  planCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  planCardAccent: { borderColor: colors.accent },
  badge: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 8 },
  badgeText: { color: '#000', fontWeight: '900', fontSize: 9 },
  planName: { color: colors.muted, fontWeight: '900', fontSize: 14, marginBottom: 4 },
  planPrice: { color: colors.white, fontWeight: '900', fontSize: 18 },
  planPeriod: { color: colors.muted, fontSize: 10, marginTop: 2 },

  tableHeader: { flexDirection: 'row-reverse', paddingBottom: 8, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeaderCell: { color: colors.muted, fontWeight: '900', fontSize: 10 },
  tableRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  tableCell: { fontSize: 12, textAlign: 'center' },
  colFeature: { flex: 1.6 },
  colValue: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 },
  proValue: { color: colors.accent, fontWeight: 'bold' },
  featureCell: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  featureIcon: { fontSize: 14 },
  featureName: { color: colors.muted, fontSize: 11, flexShrink: 1 },

  upgradeBtn: { backgroundColor: colors.accent, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  upgradeBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },
});
