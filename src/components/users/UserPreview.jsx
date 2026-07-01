/**
 * UserPreview.jsx — معاينة كاملة لبيانات وصلاحيات مستخدم
 * منقول من UserPreviewPage داخل camp-registry-react/src/pages/Users/UsersList.jsx
 * (يُستخدم فقط لمعاينة platform_owner، الذي لا يمكن محاكاة دخوله فعلياً)
 */
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import Modal from '../ui/Modal'
import { ROLE_CONFIG } from './roleConfig'
import { colors, radius } from '../../theme'

const ALL_PAGES = [
  { icon: '📊', label: 'لوحة التحكم', roles: ['all'] },
  { icon: '👨‍👩‍👧‍👦', label: 'قائمة الأسر', roles: ['all'] },
  { icon: '➕', label: 'إضافة أسرة', roles: ['all'] },
  { icon: '🔄', label: 'حركات الأسر', roles: ['all'] },
  { icon: '🏕️', label: 'المخيمات', roles: ['all'] },
  { icon: '📦', label: 'التوزيعات', roles: ['all'] },
  { icon: '📈', label: 'التقارير', roles: ['all'] },
  { icon: '🔔', label: 'التنبيهات', roles: ['all'] },
  { icon: '💬', label: 'رسائل SMS', roles: ['all'] },
  { icon: '⚙️', label: 'الإعدادات', roles: ['all'] },
  { icon: '❓', label: 'المساعدة', roles: ['all'] },
  { icon: '👥', label: 'المستخدمون', roles: ['platform_owner', 'super_admin'] },
  { icon: '📋', label: 'سجل النشاط', roles: ['platform_owner', 'super_admin'] },
  { icon: '📱', label: 'الأجهزة', roles: ['platform_owner', 'super_admin'] },
  { icon: '💾', label: 'استيراد/تصدير', roles: ['platform_owner', 'super_admin'] },
  { icon: '💎', label: 'الاشتراك', roles: ['platform_owner'] },
]

export default function UserPreview({ user, camps, users, onClose }) {
  const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))
  const role = user.role
  const isDelegateRole = role === 'camp_delegate'
  const isAssistantRole = role === 'assistant'
  const cfg = ROLE_CONFIG[role] || { icon: '👤', label: role, textColor: colors.muted }

  const perms = [
    { label: '➕ إضافة', value: user.can_add },
    { label: '✏️ تعديل', value: user.can_edit },
    { label: '🗑️ حذف', value: user.can_delete },
    { label: '📤 تصدير', value: user.can_export },
    { label: '📥 استيراد', value: user.can_import },
  ]

  const supervisor = users.find(u => u.id === user.supervisor_id)
  const myCamps = (isDelegateRole || isAssistantRole)
    ? camps.filter(c => c.id === user.camp_id || c.parent_camp_id === user.camp_id)
    : camps
  const subordinates = users.filter(u => u.supervisor_id === user.id).slice(0, 3)

  function canSeePage(page) {
    return page.roles.includes('all') || page.roles.includes(role)
  }

  return (
    <Modal open onClose={onClose} title={`👁️ معاينة: ${user.full_name}`} size="lg">
      <ScrollView style={{ maxHeight: 500 }}>
        <View style={{ gap: 14 }}>
          {/* بطاقة الهوية */}
          <View style={styles.card}>
            <View style={styles.identityRow}>
              <View style={[styles.avatar, { backgroundColor: cfg.bgColor, borderColor: cfg.borderColor }]}>
                <Text style={{ fontSize: 24 }}>{cfg.icon}</Text>
              </View>
              <View>
                <Text style={styles.userName}>{user.full_name}</Text>
                <Text style={[styles.userRole, { color: cfg.textColor }]}>{cfg.label}</Text>
                {!!(user.camp_id && campMap[user.camp_id]) && (
                  <Text style={styles.userCamp}>🏕️ {campMap[user.camp_id]}</Text>
                )}
              </View>
            </View>
            <View style={styles.infoGrid}>
              {[
                ['🪪 الهوية', user.national_id],
                ['📞 الجوال', user.phone],
                ['🟢 الحالة', user.is_active !== false ? 'نشط' : 'موقوف'],
                ['🔑 كلمة المرور', user.must_change_pass ? '⚠️ يجب تغييرها' : '✅ طبيعية'],
              ].filter(([, v]) => v).map(([k, v]) => (
                <View key={k} style={styles.infoItem}>
                  <Text style={styles.infoKey}>{k}</Text>
                  <Text style={styles.infoValue}>{v}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* التسلسل الوظيفي */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>👥 التسلسل الوظيفي</Text>
            {supervisor && (
              <View style={styles.chainRow}>
                <Text style={{ fontSize: 16 }}>{ROLE_CONFIG[supervisor.role]?.icon || '👤'}</Text>
                <View>
                  <Text style={styles.chainName}>{supervisor.full_name}</Text>
                  <Text style={styles.chainMeta}>{ROLE_CONFIG[supervisor.role]?.label} — مشرفي</Text>
                </View>
              </View>
            )}
            <View style={[styles.chainRow, styles.chainRowActive, { borderColor: cfg.borderColor, backgroundColor: cfg.bgColor }]}>
              <Text style={{ fontSize: 16 }}>{cfg.icon}</Text>
              <View>
                <Text style={styles.chainName}>{user.full_name}</Text>
                <Text style={{ color: cfg.textColor, fontSize: 11 }}>{cfg.label} ← أنت</Text>
              </View>
            </View>
            {subordinates.map(sub => (
              <View key={sub.id} style={[styles.chainRow, { marginRight: 16 }]}>
                <Text style={{ fontSize: 14 }}>{ROLE_CONFIG[sub.role]?.icon || '👤'}</Text>
                <View>
                  <Text style={styles.chainNameSmall}>{sub.full_name}</Text>
                  <Text style={styles.chainMeta}>{ROLE_CONFIG[sub.role]?.label}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* المخيمات التي يراها */}
          {(isDelegateRole || isAssistantRole) && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>🏕️ المخيمات التي يراها</Text>
              {myCamps.length === 0 ? (
                <Text style={styles.emptyText}>لا يوجد مخيم محدد</Text>
              ) : myCamps.map(c => (
                <View key={c.id} style={styles.campRow}>
                  <Text>{c.parent_camp_id ? '🏕️' : '⛺'}</Text>
                  <View>
                    <Text style={styles.chainName}>{c.name}</Text>
                    {!!c.address && <Text style={styles.chainMeta}>📍 {c.address}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* صلاحيات الأفعال */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>🔐 صلاحيات الأفعال</Text>
            <View style={styles.permsRow}>
              {perms.map(p => (
                <View key={p.label} style={[styles.permChip, { backgroundColor: p.value ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)', borderColor: p.value ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)' }]}>
                  <Text style={{ color: p.value ? colors.green : colors.red, fontSize: 12, fontWeight: '700' }}>
                    {p.label} {p.value ? '✓' : '✗'}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* الصفحات */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>📱 الصفحات</Text>
            {ALL_PAGES.map(page => {
              const allowed = canSeePage(page)
              return (
                <View key={page.label} style={[styles.pageRow, { backgroundColor: allowed ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.05)', borderRightColor: allowed ? colors.green : colors.red }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text>{page.icon}</Text>
                    <Text style={{ color: allowed ? colors.white : colors.muted, fontSize: 12, fontWeight: '700' }}>{page.label}</Text>
                  </View>
                  <Text style={{ color: allowed ? colors.green : colors.red, fontSize: 11, fontWeight: '900' }}>
                    {allowed ? '✓ مسموح' : '✗ ممنوع'}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 56, height: 56, borderRadius: radius.lg, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  userName: { color: colors.white, fontWeight: '900', fontSize: 15 },
  userRole: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  userCamp: { color: colors.muted, fontSize: 11, marginTop: 2 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 8, minWidth: '46%', flexGrow: 1 },
  infoKey: { color: colors.muted, fontSize: 9 },
  infoValue: { color: colors.white, fontWeight: '700', fontSize: 12, marginTop: 2 },
  sectionTitle: { color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  chainRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  chainRowActive: { borderWidth: 2 },
  chainName: { color: colors.white, fontSize: 12, fontWeight: '700' },
  chainNameSmall: { color: colors.white, fontSize: 11 },
  chainMeta: { color: colors.muted, fontSize: 10 },
  campRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  emptyText: { color: colors.muted, fontSize: 12 },
  permsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1 },
  pageRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderRightWidth: 3, marginBottom: 6,
  },
})
