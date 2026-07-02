/**
 * DrawerContent.jsx — محتوى القائمة الجانبية المخصص (Drawer)
 * يُستدعى عبر drawerContent في RootNavigator، بدلاً من القائمة الافتراضية.
 *
 * يعرض: رأس بمعلومات المستخدم (الاسم + شارة الدور)، ثم عناصر التنقل
 * (كل عنصر مشروط بنفس صلاحية ظهور بطاقته السابقة في Dashboard)، ثم زر
 * تسجيل الخروج أسفل القائمة. هذا يكافئ Sidebar الأصلي في نسخة الويب،
 * لكن بنمط "قائمة منزلقة تفتح بضغطة ☰" المناسب لشاشات الموبايل الصغيرة
 * (قرار متفَق عليه صراحة مع محمود، بدل قائمة جانبية ثابتة دائمة الظهور).
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { DrawerContentScrollView } from '@react-navigation/drawer'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../lib/permissions'
import { colors, radius } from '../theme'

const NAV_ITEMS = [
  { route: 'Dashboard',        icon: '🏠', label: 'الرئيسية',          show: () => true },
  { route: 'Families',         icon: '👨‍👩‍👧‍👦', label: 'قائمة الأسر',   show: () => true },
  { route: 'Camps',            icon: '⛺', label: 'إدارة المخيمات',      show: () => true },
  { route: 'Movements',        icon: '🚶', label: 'حركات الأسر',        show: () => true },
  { route: 'SMS',              icon: '💬', label: 'إرسال رسائل SMS',    show: () => true },
  { route: 'Distributions',    icon: '📦', label: 'التوزيعات',          show: () => true },
  { route: 'Users',            icon: '👥', label: 'إدارة المستخدمين',   show: (a) => a.isOwner || a.isSuperAdmin || a.isCampDelegate },
  { route: 'PendingRequests',  icon: '📋', label: 'الطلبات المعلّقة',   show: (a) => a.isOwner || a.profile?.can_review_approvals === true },
  { route: 'PaperPreview',     icon: '🧪', label: 'معاينة Paper (تجريبي)', show: () => true },
]

export default function DrawerContent(props) {
  const auth = useAuth()
  const { profile, role, signOut } = auth
  const roleColor = ROLE_COLORS[role] || colors.muted
  const currentRoute = props.state.routeNames[props.state.index]

  return (
    <View style={styles.wrap}>
      <DrawerContentScrollView {...props} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🏕️ نبض المخيم</Text>
          <Text style={styles.userName}>{profile?.full_name || '—'}</Text>
          <View style={[styles.roleBadge, { borderColor: roleColor }]}>
            <Text style={[styles.roleBadgeText, { color: roleColor }]}>{ROLE_LABELS[role] || role || '—'}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.items}>
          {NAV_ITEMS.filter(item => item.show(auth)).map(item => {
            const active = currentRoute === item.route
            return (
              <TouchableOpacity
                key={item.route}
                onPress={() => props.navigation.navigate(item.route)}
                activeOpacity={0.7}
                style={[styles.item, active && styles.itemActive]}
              >
                <Text style={styles.itemIcon}>{item.icon}</Text>
                <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <TouchableOpacity onPress={signOut} activeOpacity={0.8} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>🚪 تسجيل الخروج</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { paddingTop: 0 },
  header: { padding: 20, paddingTop: 24, gap: 4 },
  headerTitle: { color: colors.white, fontWeight: '900', fontSize: 16 },
  userName: { color: colors.muted, fontSize: 13, marginTop: 6 },
  roleBadge: {
    alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 999, borderWidth: 1,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16, marginBottom: 8 },
  items: { paddingHorizontal: 10, gap: 2 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: radius.md,
  },
  itemActive: { backgroundColor: 'rgba(245,158,11,0.15)' },
  itemIcon: { fontSize: 18 },
  itemLabel: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  itemLabelActive: { color: colors.accent, fontWeight: '800' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  signOutBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: radius.md, paddingVertical: 12, alignItems: 'center',
  },
  signOutText: { color: colors.red, fontWeight: '700', fontSize: 13 },
})
