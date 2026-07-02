/**
 * DashboardScreen.jsx — الصفحة الرئيسية (نسخة مبسّطة، أساسيات + صلاحيات)
 *
 * ⚠️ بعد إضافة Drawer Navigation (2 يوليو 2026)، بطاقات التنقل التي كانت
 * هنا مؤقتاً (رابط مباشر لكل شاشة) أُزيلت — التنقل بين الشاشات أصبح عبر
 * القائمة الجانبية (☰) المتاحة من كل شاشة، فتكرارها هنا لم يعد ضرورياً.
 * هذه الشاشة الآن أقرب لطبيعتها الأصلية: ترحيب + ملخص صلاحيات المستخدم.
 *
 * ⚠️ لا تزال هذه نسخة مبسّطة (ليست الأصل 403 سطر بإحصائيات شاملة —
 * عدد الأسر، توزيعات حديثة، نشاط الأسر، تنبيهات). يمكن استكمالها لاحقاً
 * كأولوية منفصلة إذا احتاجها محمود فعلياً.
 */
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useNavigation, DrawerActions } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../lib/permissions'
import PageHeader from '../components/ui/PageHeader'
import SafeScreen from '../components/ui/SafeScreen'
import { colors, radius } from '../theme'

export default function DashboardScreen() {
  const { profile, role, isOwner, isSuperAdmin, isCampDelegate, isAssistant } = useAuth()
  const navigation = useNavigation()

  return (
    <SafeScreen>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <PageHeader
        icon="🏕️" title="نبض المخيم"
        subtitle={`أهلاً ${profile?.full_name || '—'}`}
        action={
          <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.menuBtn}>
            <Text style={styles.menuBtnText}>☰</Text>
          </TouchableOpacity>
        }
      />

      <View style={[styles.roleBadge, { borderColor: ROLE_COLORS[role] || colors.muted }]}>
        <Text style={[styles.roleText, { color: ROLE_COLORS[role] || colors.muted }]}>
          {ROLE_LABELS[role] || role || '—'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>✅ تم تسجيل الدخول بنجاح</Text>
        <Text style={styles.cardText}>
          افتح القائمة الجانبية (☰) للتنقل بين قائمة الأسر، المخيمات، الحركات، والصفحات الأخرى.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>الصلاحيات الحالية</Text>
        <PermRow label="مالك المنصة" value={isOwner} />
        <PermRow label="مدير إيواء أو أعلى" value={isSuperAdmin} />
        <PermRow label="مندوب مخيم أو أعلى" value={isCampDelegate} />
        <PermRow label="مساعد" value={isAssistant} />
      </View>
    </ScrollView>
    </SafeScreen>
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
  menuBtn: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  menuBtnText: { color: colors.white, fontSize: 18 },
  roleBadge: {
    alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4,
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
})
