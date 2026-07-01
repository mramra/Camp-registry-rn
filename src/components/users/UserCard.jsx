/**
 * UserCard.jsx — بطاقة مستخدم واحد
 * منقول من camp-registry-react/src/pages/Users/UsersList.jsx (مكوّن محلي)
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, radius } from '../../theme'

export default function UserCard({
  user, cfg, campMap, isMe, onEdit, onToggle, onDelete, onReset, onPreview,
  isOwner, isSuperAdmin, childCount, isOpen, onToggleOpen, indent = 0, pending,
}) {
  const active = user.is_active !== false

  return (
    <View style={[styles.card, { borderRightColor: cfg.borderColor, marginRight: indent * 16 }, !active && styles.inactive]}>
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: cfg.bgColor, borderColor: cfg.borderColor }]}>
          <Text style={{ fontSize: 15 }}>{cfg.icon}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user.full_name}</Text>
            {isMe && <Badge text="أنت" color={colors.green} />}
            {user.must_change_pass && <Text style={{ fontSize: 10 }}>⚠️</Text>}
            {!!pending && (
              <Badge text={pending === 'user_delete' ? 'طلب حذف معلَّق' : 'طلب تعديل معلَّق'} color={colors.accent} />
            )}
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.roleLabel, { color: cfg.textColor }]}>{cfg.label}</Text>
            {!!user.national_id && <Text style={styles.metaText}>🪪 {user.national_id}</Text>}
            {!!(user.camp_id && campMap[user.camp_id]) && <Text style={styles.metaTextBlue}>🏕️ {campMap[user.camp_id]}</Text>}
            <Text style={{ color: active ? colors.green : colors.red, fontSize: 10 }}>{active ? '● نشط' : '● موقوف'}</Text>
          </View>
        </View>

        {childCount > 0 && onToggleOpen && (
          <TouchableOpacity onPress={onToggleOpen} style={styles.toggleBtn}>
            <Text style={styles.toggleBtnText}>{isOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {user.role !== 'platform_owner' && (
        <View style={styles.actions}>
          {(isOwner || isSuperAdmin) && (
            <TouchableOpacity onPress={() => onEdit(user)} style={styles.actionBtn}>
              <Text>✏️</Text>
            </TouchableOpacity>
          )}
          {!!onPreview && (
            <TouchableOpacity onPress={() => onPreview(user)} style={[styles.actionBtn, styles.actionBtnGreen]}>
              <Text>👁️</Text>
            </TouchableOpacity>
          )}
          {!isMe && (
            <TouchableOpacity onPress={() => onToggle(user)} style={[styles.actionBtn, active ? styles.actionBtnRed : styles.actionBtnGreen]}>
              <Text>{active ? '🚫' : '✅'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onReset(user)} style={[styles.actionBtn, styles.actionBtnAccent]}>
            <Text>🔑</Text>
          </TouchableOpacity>
          {!isMe && (isOwner || isSuperAdmin) && (
            <TouchableOpacity onPress={() => onDelete(user)} style={[styles.actionBtn, styles.actionBtnRed]}>
              <Text>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  )
}

function Badge({ text, color }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '26', borderColor: color + '66' }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRightWidth: 4, borderRadius: radius.md, marginBottom: 6, overflow: 'hidden',
  },
  inactive: { opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  iconBox: { width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { color: colors.white, fontWeight: '700', fontSize: 13 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 },
  roleLabel: { fontSize: 10, fontWeight: '700' },
  metaText: { color: colors.muted, fontSize: 10 },
  metaTextBlue: { color: colors.blue, fontSize: 10 },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  toggleBtn: { width: 24, height: 24, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  toggleBtnText: { color: colors.muted, fontSize: 10 },
  actions: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10, flexWrap: 'wrap' },
  actionBtn: { backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5 },
  actionBtnGreen: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' },
  actionBtnRed: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' },
  actionBtnAccent: { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)' },
})
