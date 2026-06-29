/**
 * DashboardScreen.jsx — نسخة أولية مبسطة (placeholder وظيفي)
 *
 * ⚠️ هذه ليست النسخة النهائية. الأصل (camp-registry-react/src/pages/Dashboard/Dashboard.jsx)
 * 403 سطر ويحتوي إحصائيات شاملة (عدد الأسر، توزيعات حديثة، نشاط الأسر، تنبيهات).
 * هذه نسخة أولى للتأكد من عمل تسجيل الدخول + الصلاحيات + التنقل فعلياً على
 * جهاز محمود عبر Expo Go، قبل استكمال نقل كل تفاصيل اللوحة الأصلية.
 */
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../lib/permissions'
import { colors, radius } from '../theme'

export default function DashboardScreen() {
  const { profile, role, signOut, isOwner, isSuperAdmin, isCampDelegate, isAssistant } = useAuth()

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>🏕️ نبض المخيم</Text>
        <Text style={styles.welcome}>أهلاً {profile?.full_name || '—'}</Text>
        <View style={[styles.roleBadge, { borderColor: ROLE_COLORS[role] || colors.muted }]}>
          <Text style={[styles.roleText, { color: ROLE_COLORS[role] || colors.muted }]}>
            {ROLE_LABELS[role] || role || '—'}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>✅ تم تسجيل الدخول بنجاح</Text>
        <Text style={styles.cardText}>
          هذه نسخة أولية من لوحة التحكم — للتأكد من عمل المصادقة ونظام الصلاحيات
          بشكل صحيح على جهازك قبل استكمال باقي الصفحات.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>الصلاحيات الحالية</Text>
        <PermRow label="مالك المنصة" value={isOwner} />
        <PermRow label="مدير إيواء أو أعلى" value={isSuperAdmin} />
        <PermRow label="مندوب مخيم أو أعلى" value={isCampDelegate} />
        <PermRow label="مساعد" value={isAssistant} />
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.8}>
        <Text style={styles.signOutText}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function PermRow({ label, value }) {
  return (
    <View style={styles.permRow}>
      <Text style={styles.permLabel}>{label}</Text>
      <Text style={[styles.permValue, { color: value ? colors.green : colors.muted }]}>
        {value ? '✓ نعم' : '— لا'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
  header: { alignItems: 'center', gap: 6, marginBottom: 8 },
  greeting: { color: colors.white, fontSize: 22, fontWeight: '900' },
  welcome: { color: colors.muted, fontSize: 14 },
  roleBadge: {
    marginTop: 6, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1,
  },
  roleText: { fontSize: 12, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 16, gap: 8,
  },
  cardTitle: { color: colors.white, fontSize: 15, fontWeight: '800' },
  cardText: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  permRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border,
  },
  permLabel: { color: colors.white, fontSize: 13 },
  permValue: { fontSize: 13, fontWeight: '700' },
  signOutBtn: {
    backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 8,
  },
  signOutText: { color: colors.red, fontWeight: '800', fontSize: 14 },
})
