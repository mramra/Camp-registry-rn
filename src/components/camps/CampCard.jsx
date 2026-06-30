/**
 * CampCard.jsx — بطاقة مخيم واحد + فروعه (إن وجدت)
 * منقول من دالة CampCard داخل camp-registry-react/src/pages/Camps/CampsList.jsx
 *
 * Props:
 *   camp       — بيانات المخيم
 *   sub        — مصفوفة الفروع التابعة لهذا المخيم
 *   famCount   — { campId: عدد الأسر }
 *   memberMap  — { campId: اسم المندوب }
 *   managerMap — { campId: اسم مدير الإيواء }
 *   isOwner, isSuperAdmin, isCampDelegate, profile — صلاحيات وهوية المستخدم
 *   onEdit, onDelete — callbacks
 *   collapsed, onToggle — حالة طي/فرد الفروع
 *   pending    — 'camp_update' | 'camp_delete' | null (طلب معلَّق على هذا المخيم)
 */
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native'
import { colors, radius } from '../../theme'

const STATUS_MAP = {
  active:    { label: '✅ نشط',    color: colors.green },
  suspended: { label: '⏸️ موقوف',  color: colors.accent },
  closed:    { label: '🔴 مغلق',   color: colors.red },
}

export default function CampCard({
  camp, sub, famCount, memberMap, managerMap,
  isOwner, isSuperAdmin, isCampDelegate, profile,
  onEdit, onDelete, collapsed, onToggle, pending,
}) {
  const fc = famCount[camp.id] || 0
  const st = STATUS_MAP[camp.status] || { label: camp.status || '—', color: colors.muted }
  const canEdit = isOwner || isSuperAdmin || (isCampDelegate && profile?.camp_id === camp.id)
  const canDel  = canEdit && fc === 0 && sub.length === 0

  const openMap = (lat, lng) => Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`)

  return (
    <View>
      <View style={[styles.card, { borderRightColor: colors.accent }]}>
        <View style={styles.headerRow}>
          <View style={styles.info}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>⛺ {camp.name}</Text>
              {!!pending && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingText}>
                    ⏳ {pending === 'camp_delete' ? 'طلب حذف معلَّق' : 'طلب تعديل معلَّق'}
                  </Text>
                </View>
              )}
            </View>

            {managerMap[camp.id] ? (
              <Text style={styles.manager}>🔴 مدير الإيواء: {managerMap[camp.id]}</Text>
            ) : (
              <Text style={styles.warning}>⚠️ بلا مدير إيواء معيّن</Text>
            )}
            {memberMap[camp.id] ? (
              <Text style={styles.delegate}>🟠 مندوب: {memberMap[camp.id]}</Text>
            ) : (
              <Text style={styles.warning}>⚠️ بلا مندوب معيّن</Text>
            )}
            {!!camp.address && <Text style={styles.address}>📍 {camp.address}</Text>}

            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                👥 {fc} أسرة{camp.capacity ? ` من ${camp.capacity}` : ''}
              </Text>
              {sub.length > 0 && (
                <TouchableOpacity onPress={onToggle}>
                  <Text style={styles.branchToggle}>
                    · 🏕️ {sub.length} فرع {collapsed ? '▼' : '▲'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {!!(camp.latitude && camp.longitude) && (
              <TouchableOpacity onPress={() => openMap(camp.latitude, camp.longitude)}>
                <Text style={styles.mapLink}>🗺️ عرض على الخريطة</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.status, { color: st.color }]}>{st.label}</Text>
        </View>

        {(canEdit || canDel) && (
          <View style={styles.actions}>
            {canEdit && (
              <TouchableOpacity onPress={() => onEdit(camp)} style={styles.editBtn}>
                <Text style={styles.editBtnText}>✏️ تعديل</Text>
              </TouchableOpacity>
            )}
            {(isOwner || isSuperAdmin) && (
              <TouchableOpacity
                onPress={() => onEdit({ ...camp, camp_type: 'sub', parent_camp_id: camp.id, name: '' })}
                style={styles.addBranchBtn}
              >
                <Text style={styles.addBranchBtnText}>➕ فرع</Text>
              </TouchableOpacity>
            )}
            {canDel && (
              <TouchableOpacity onPress={() => onDelete(camp)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>🗑️ حذف</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* الفروع */}
      {!collapsed && sub.map(s => (
        <View key={s.id} style={[styles.subCard, { borderRightColor: colors.blue }]}>
          <View style={styles.headerRow}>
            <View style={styles.info}>
              <Text style={styles.subTitle}>🏕️ {s.name}</Text>
              {managerMap[s.id] ? (
                <Text style={styles.subManager}>🔴 {managerMap[s.id]}</Text>
              ) : (
                <Text style={styles.subWarning}>⚠️ بلا مدير إيواء</Text>
              )}
              {memberMap[s.id] ? (
                <Text style={styles.subDelegate}>🟠 {memberMap[s.id]}</Text>
              ) : (
                <Text style={styles.subWarning}>⚠️ بلا مندوب</Text>
              )}
              {!!s.address && <Text style={styles.subAddress}>📍 {s.address}</Text>}
              <Text style={styles.subMeta}>👥 {famCount[s.id] || 0} أسرة</Text>
            </View>
            <View style={styles.subRight}>
              <Text style={[styles.status, { color: (STATUS_MAP[s.status] || { color: colors.muted }).color, fontSize: 10 }]}>
                {(STATUS_MAP[s.status] || { label: s.status }).label}
              </Text>
              {canEdit && (
                <TouchableOpacity onPress={() => onEdit(s)} style={styles.subEditBtn}>
                  <Text style={styles.subEditText}>✏️</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRightWidth: 3, borderRadius: radius.md, padding: 14,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  info: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { color: colors.white, fontWeight: '900', fontSize: 14 },
  pendingBadge: {
    backgroundColor: colors.accent + '26', borderWidth: 1, borderColor: colors.accent + '66',
    borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2,
  },
  pendingText: { color: colors.accent, fontSize: 9, fontWeight: '700' },
  manager:  { color: colors.red, fontSize: 11, marginTop: 2 },
  delegate: { color: colors.accent, fontSize: 11, marginTop: 2 },
  warning:  { color: colors.red, fontSize: 11, marginTop: 2, fontWeight: '700' },
  address:  { color: colors.muted, fontSize: 10, marginTop: 2 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta:     { color: colors.muted, fontSize: 10 },
  branchToggle: { color: colors.blue, fontSize: 10 },
  mapLink:  { color: colors.blue, fontSize: 10, marginTop: 4 },
  status:   { fontSize: 10, fontWeight: '700' },
  actions:  { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  editBtn: {
    backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)',
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6,
  },
  editBtnText: { color: colors.blue, fontSize: 11, fontWeight: '700' },
  addBranchBtn: {
    backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)',
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6,
  },
  addBranchBtnText: { color: colors.green, fontSize: 11, fontWeight: '700' },
  deleteBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6,
  },
  deleteBtnText: { color: colors.red, fontSize: 11, fontWeight: '700' },

  subCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRightWidth: 3, borderRadius: radius.md, padding: 10,
    marginRight: 16, marginTop: 6,
  },
  subTitle: { color: colors.white, fontWeight: '700', fontSize: 12 },
  subManager: { color: colors.red, fontSize: 10, marginTop: 2 },
  subDelegate: { color: colors.accent, fontSize: 10, marginTop: 2 },
  subWarning: { color: colors.red, fontSize: 10, marginTop: 2, fontWeight: '700' },
  subAddress: { color: colors.muted, fontSize: 10 },
  subMeta: { color: colors.muted, fontSize: 10 },
  subRight: { alignItems: 'flex-end', gap: 4 },
  subEditBtn: {
    backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)',
    borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4,
  },
  subEditText: { fontSize: 11 },
})
