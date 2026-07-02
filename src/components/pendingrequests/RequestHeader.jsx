/**
 * RequestHeader.jsx — رأس تفاصيل طلب موافقة واحد
 * منقول من camp-registry-react/src/pages/PendingRequests/PendingRequests.jsx
 * نفس المنطق بالضبط لعرض الفروقات حسب نوع الطلب (أسرة/مخيم/مستخدم/حركة).
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { colors, radius } from '../../theme'

export const ACTION_LABEL = {
  insert: { icon: '➕', label: 'إضافة أسرة جديدة', color: colors.green },
  update: { icon: '✏️', label: 'تعديل بيانات أسرة', color: colors.blue },
  delete: { icon: '🗑️', label: 'طلب حذف أسرة', color: colors.red },
  movement_entry:    { icon: '🟢', label: 'تسجيل دخول أسرة',     color: colors.green },
  movement_exit:     { icon: '🔴', label: 'تسجيل خروج أسرة',     color: colors.red },
  movement_transfer: { icon: '🔵', label: 'نقل أسرة بين مخيمات', color: colors.blue },
  camp_insert: { icon: '🏕️', label: 'طلب إضافة مخيم', color: colors.green },
  camp_update: { icon: '🏕️', label: 'طلب تعديل مخيم', color: colors.blue },
  camp_delete: { icon: '🏕️', label: 'طلب حذف مخيم',   color: colors.red },
  user_insert: { icon: '👤', label: 'طلب إضافة مستخدم', color: colors.green },
  user_update: { icon: '👤', label: 'طلب تعديل مستخدم', color: colors.blue },
  user_delete: { icon: '👤', label: 'طلب حذف مستخدم',   color: colors.red },
}

export const ROLE_LABEL = {
  platform_owner: 'ملك المنصة',
  super_admin: 'مدير الإيواء',
  camp_delegate: 'المندوب',
  assistant: 'المساعد',
}

function FieldDiff({ changes }) {
  if (!changes || typeof changes !== 'object') return null
  const entries = Object.entries(changes)
  if (!entries.length) return null
  return (
    <View style={styles.diffBox}>
      {entries.map(([field, diff]) => (
        <Text key={field} style={styles.diffLine}>
          <Text style={styles.diffField}>{field}: </Text>
          <Text style={styles.diffOld}>{String(diff?.old ?? diff?.[0] ?? '—')}</Text>
          <Text style={styles.diffArrow}> ← </Text>
          <Text style={styles.diffNew}>{String(diff?.new ?? diff?.[1] ?? '—')}</Text>
        </Text>
      ))}
    </View>
  )
}

export default function RequestHeader({ req, campMap, memberByUserId }) {
  const navigation = useNavigation()
  const meta = ACTION_LABEL[req.action] || ACTION_LABEL.update
  const isMovement = req.action?.startsWith('movement_')
  const isCamp = req.action?.startsWith('camp_')
  const isUser = req.action?.startsWith('user_')
  const submitter = memberByUserId?.[req.changed_by]
  const submitterName = req.user_name || submitter?.full_name || '—'
  const submitterRole = req.user_role || submitter?.role
  const famName = req.new_data?.head_name || req.old_data?.head_name || req.family_name || '—'
  const campData = req.new_data || req.old_data || {}
  const userData = req.new_data || req.old_data || {}

  return (
    <View>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={{ color: meta.color }}>{meta.icon}</Text>
            <Text style={styles.title}>{meta.label}</Text>
          </View>
          <Text style={styles.submitterText}>
            👤 {submitterName} ({ROLE_LABEL[submitterRole] || submitterRole || '—'})
            {req.created_at ? ` • ${new Date(req.created_at).toLocaleString('ar-EG')}` : ''}
          </Text>
        </View>
        {!isCamp && !isUser && (
          <TouchableOpacity onPress={() => navigation.navigate('FamilyForm', { familyId: req.family_id })}>
            <Text style={styles.viewLink}>عرض الأسرة ←</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.nameBox}>
        <Text style={styles.nameText}>
          {isCamp ? (campData.name || '—') : isUser ? (userData.full_name || '—') : famName}
        </Text>
      </View>

      {req.action === 'update' && <FieldDiff changes={req.changes} />}

      {isUser && (
        <View style={styles.detailBox}>
          <Text style={styles.detailLine}>🏷️ الدور المطلوب: <Text style={styles.detailValue}>{ROLE_LABEL[userData.role] || userData.role || '—'}</Text></Text>
          {!!userData.phone && <Text style={styles.detailLine}>📱 الجوال: <Text style={styles.detailValueWhite}>{userData.phone}</Text></Text>}
          {!!userData.camp_id && (
            <Text style={styles.detailLine}>🏕️ المخيم: <Text style={styles.detailValue}>{campMap?.[userData.camp_id] || '—'}</Text></Text>
          )}
          {req.action === 'user_insert' && (
            <Text style={styles.warnText}>⚠️ كلمة المرور ستُعرَض لك بعد الموافقة — شاركها مع المستخدم</Text>
          )}
        </View>
      )}

      {isCamp && (
        <View style={styles.detailBox}>
          <Text style={styles.detailLine}>🏷️ النوع: <Text style={styles.detailValue}>{campData.camp_type === 'sub' ? 'فرع' : 'رئيسي'}</Text></Text>
          {!!campData.parent_camp_id && (
            <Text style={styles.detailLine}>🏕️ تابع لـ: <Text style={styles.detailValue}>{campMap?.[campData.parent_camp_id] || '—'}</Text></Text>
          )}
          {!!campData.address && <Text style={styles.detailLine}>📍 العنوان: <Text style={styles.detailValueWhite}>{campData.address}</Text></Text>}
          {req.action === 'camp_update' && !!req.old_data && (
            <Text style={styles.detailLineBorder}>قبل التعديل: <Text style={styles.detailValueMuted}>{req.old_data.name}</Text></Text>
          )}
        </View>
      )}

      {isMovement && (
        <View style={styles.detailBox}>
          {!!req.new_data?.from_camp && (
            <Text style={styles.detailLine}>📤 من: <Text style={styles.detailValue}>{campMap?.[req.new_data.from_camp] || '—'}</Text></Text>
          )}
          {!!req.new_data?.to_camp && (
            <Text style={styles.detailLine}>📥 إلى: <Text style={styles.detailValue}>{campMap?.[req.new_data.to_camp] || '—'}</Text></Text>
          )}
          <Text style={styles.detailLine}>📅 التاريخ: <Text style={styles.detailValue}>{req.new_data?.date || '—'}</Text></Text>
          {!!req.new_data?.reason && <Text style={styles.detailLine}>📝 السبب: <Text style={styles.detailValueWhite}>{req.new_data.reason}</Text></Text>}
          {!!req.new_data?.notes && <Text style={styles.detailLine}>🗒️ ملاحظات: <Text style={styles.detailValueWhite}>{req.new_data.notes}</Text></Text>}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: colors.white, fontWeight: '700', fontSize: 13 },
  submitterText: { color: colors.muted, fontSize: 11, marginTop: 2 },
  viewLink: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  nameBox: { backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  nameText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  diffBox: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 10, marginTop: 6, gap: 4 },
  diffLine: { fontSize: 11 },
  diffField: { color: colors.muted, fontWeight: '700' },
  diffOld: { color: colors.red, textDecorationLine: 'line-through' },
  diffArrow: { color: colors.muted },
  diffNew: { color: colors.green },
  detailBox: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 10, marginTop: 6, gap: 3 },
  detailLine: { color: colors.muted, fontSize: 11 },
  detailLineBorder: { color: colors.muted, fontSize: 11, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 2 },
  detailValue: { color: colors.white, fontWeight: '700' },
  detailValueWhite: { color: colors.white },
  detailValueMuted: { color: colors.muted },
  warnText: { color: colors.accent, fontSize: 11 },
})
