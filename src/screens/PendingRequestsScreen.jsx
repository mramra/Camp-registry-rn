/**
 * PendingRequestsScreen.jsx — مراجعة طلبات الموافقة المعلَّقة
 * منقول من camp-registry-react/src/pages/PendingRequests/PendingRequests.jsx (315 سطر)
 *
 * تبسيط متعمد (موثَّق كالمعتاد): تحميل مباشر من Supabase بدل query()
 * offline-first الوهمية. window.confirm/textarea → Alert/TextInput.
 *
 * محفوظ بالكامل: تبويبان (معلّقة/سجل قرارات)، فلترة الرؤية الهرمية
 * (canUserReviewRequest)، منطق الموافقة/الرفض (approveRequest/rejectRequest
 * من db.js — منقولتان مسبقاً بالكامل)، ملاحظة رفض اختيارية.
 */
import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import {
  ORG_ID, supabase, approveRequest, canUserReviewRequest,
  fetchPendingRequests, fetchDecisionLog, rejectRequest,
} from '../lib/db'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import SafeScreen from '../components/ui/SafeScreen'
import RequestHeader, { ROLE_LABEL } from '../components/pendingrequests/RequestHeader'
import { colors, radius } from '../theme'

export default function PendingRequestsScreen() {
  const { profile, isOwner } = useAuth()
  const { showToast } = useApp()
  const [tab,         setTab]         = useState('pending') // pending | log
  const [requests,    setRequests]    = useState([])
  const [decisionLog, setDecisionLog] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [busyId,      setBusyId]      = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [note,        setNote]        = useState('')
  const [campMap,     setCampMap]     = useState({})
  const [memberByUserId, setMemberByUserId] = useState({})

  const canReview = isOwner || profile?.can_review_approvals === true

  useEffect(() => { if (canReview) load() }, [canReview, tab])

  async function load() {
    setLoading(true)
    try {
      const [{ data: members }, { data: camps }] = await Promise.all([
        supabase.from('org_members').select('*').eq('org_id', ORG_ID),
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
      ])
      const byUserId = Object.fromEntries((members || []).map(m => [m.user_id, m]))
      setMemberByUserId(byUserId)
      setCampMap(Object.fromEntries((camps || []).map(c => [c.id, c.name])))

      if (tab === 'pending') {
        const rows = await fetchPendingRequests()
        const visible = isOwner ? rows : rows.filter(r => canUserReviewRequest(profile, byUserId[r.changed_by]))
        setRequests(visible)
      } else {
        const rows = await fetchDecisionLog()
        const visible = isOwner ? rows : rows.filter(r => canUserReviewRequest(profile, byUserId[r.changed_by]))
        setDecisionLog(visible)
      }
    } catch (e) {
      showToast('خطأ: ' + e.message, true)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(req) {
    setBusyId(req.id)
    const res = await approveRequest(req, profile)
    setBusyId(null)
    if (res.ok) {
      showToast('✅ تمت الموافقة على الطلب')
      setRequests(r => r.filter(x => x.id !== req.id))
    } else {
      showToast('خطأ: ' + res.error, true)
    }
  }

  async function handleReject(req) {
    setBusyId(req.id)
    const res = await rejectRequest(req, profile, note)
    setBusyId(null)
    setRejectingId(null)
    setNote('')
    if (res.ok) {
      showToast('✅ تم رفض الطلب وإعادة البيانات لحالتها السابقة')
      setRequests(r => r.filter(x => x.id !== req.id))
    } else {
      showToast('خطأ: ' + res.error, true)
    }
  }

  if (!canReview) {
    return (
      <SafeScreen>
        <View style={styles.noAccessWrap}>
          <Text style={styles.noAccessIcon}>⛔</Text>
          <Text style={styles.noAccessText}>لا تملك صلاحية مراجعة الطلبات</Text>
        </View>
      </SafeScreen>
    )
  }

  return (
    <SafeScreen>
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          icon="📋" title="الطلبات المعلّقة"
          subtitle={tab === 'pending' ? `${requests.length} طلب بانتظار مراجعتك` : `${decisionLog.length} قرار سابق`}
        />

        <View style={styles.tabs}>
          <TouchableOpacity onPress={() => setTab('pending')} style={[styles.tab, tab === 'pending' && styles.tabActive]}>
            <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>⏳ معلّقة</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab('log')} style={[styles.tab, tab === 'log' && styles.tabActive]}>
            <Text style={[styles.tabText, tab === 'log' && styles.tabTextActive]}>📜 سجل القرارات</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator color={colors.accent} size="large" /></View>
        ) : tab === 'pending' ? (
          requests.length === 0 ? (
            <EmptyState icon="✅" title="لا توجد طلبات معلّقة" subtitle="كل التعديلات والإضافات تمت الموافقة عليها" />
          ) : (
            <View style={{ gap: 10 }}>
              {requests.map(req => (
                <View key={req.id} style={styles.card}>
                  <RequestHeader req={req} campMap={campMap} memberByUserId={memberByUserId} />

                  {req.action === 'delete' && !!req.old_data && (
                    <View style={styles.deleteWarn}>
                      <Text style={styles.deleteWarnText}>
                        سيُحذف هذا السجل نهائياً من قاعدة البيانات عند الموافقة — لا يمكن التراجع بعدها.
                      </Text>
                    </View>
                  )}

                  {rejectingId === req.id ? (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <TextInput
                        value={note} onChangeText={setNote}
                        placeholder="ملاحظة الرفض (اختياري)..." placeholderTextColor={colors.muted}
                        multiline numberOfLines={2} style={styles.noteInput}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => handleReject(req)} disabled={busyId === req.id}
                          style={[styles.rejectConfirmBtn, busyId === req.id && styles.disabled]}
                        >
                          <Text style={styles.rejectConfirmBtnText}>
                            {busyId === req.id ? '⏳ جاري...' : '✕ تأكيد الرفض'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setRejectingId(null); setNote('') }} style={styles.cancelBtn}>
                          <Text style={styles.cancelBtnText}>إلغاء</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => handleApprove(req)} disabled={busyId === req.id}
                        style={[styles.approveBtn, busyId === req.id && styles.disabled]}
                      >
                        <Text style={styles.approveBtnText}>{busyId === req.id ? '⏳ جاري...' : '✓ موافقة'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setRejectingId(req.id)} disabled={busyId === req.id}
                        style={[styles.rejectBtn, busyId === req.id && styles.disabled]}
                      >
                        <Text style={styles.rejectBtnText}>✕ رفض</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )
        ) : (
          decisionLog.length === 0 ? (
            <EmptyState icon="📜" title="لا توجد قرارات سابقة" subtitle="ستظهر هنا كل الطلبات بعد الموافقة أو الرفض عليها" />
          ) : (
            <View style={{ gap: 10 }}>
              {decisionLog.map(req => (
                <View key={req.id} style={styles.card}>
                  <RequestHeader req={req} campMap={campMap} memberByUserId={memberByUserId} />
                  <View style={[styles.decisionBox, { backgroundColor: req.status === 'approved' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }]}>
                    <Text style={{ color: req.status === 'approved' ? colors.green : colors.red, fontWeight: '700', fontSize: 12 }}>
                      {req.status === 'approved' ? '✓ تمت الموافقة' : '✕ تم الرفض'}
                    </Text>
                    <Text style={styles.decisionMeta}>
                      {req.reviewed_by_name || '—'} ({ROLE_LABEL[req.reviewed_by_role] || req.reviewed_by_role || '—'})
                    </Text>
                  </View>
                  {!!req.review_note && <Text style={styles.reviewNote}>📝 {req.review_note}</Text>}
                  <Text style={styles.reviewDate}>
                    {req.reviewed_at ? new Date(req.reviewed_at).toLocaleString('ar-EG') : ''}
                  </Text>
                </View>
              ))}
            </View>
          )
        )}
      </ScrollView>
    </View>
    </SafeScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  noAccessWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  noAccessIcon: { fontSize: 40, marginBottom: 10 },
  noAccessText: { color: colors.muted, fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 8, backgroundColor: colors.surface2, borderRadius: radius.md, padding: 4, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: colors.bg },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  deleteWarn: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, marginTop: 6 },
  deleteWarnText: { color: colors.muted, fontSize: 11 },
  noteInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 8, color: colors.white, fontSize: 12,
    textAlign: 'right', textAlignVertical: 'top', minHeight: 50,
  },
  approveBtn: { flex: 1, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  approveBtnText: { color: colors.green, fontWeight: '700', fontSize: 12 },
  rejectBtn: { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  rejectBtnText: { color: colors.red, fontWeight: '700', fontSize: 12 },
  rejectConfirmBtn: { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  rejectConfirmBtnText: { color: colors.red, fontWeight: '700', fontSize: 12 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  disabled: { opacity: 0.5 },
  decisionBox: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  decisionMeta: { color: colors.muted, fontSize: 10, opacity: 0.8 },
  reviewNote: { color: colors.muted, fontSize: 11, marginTop: 6 },
  reviewDate: { color: colors.muted, fontSize: 10, marginTop: 4 },
})
