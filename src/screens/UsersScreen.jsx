/**
 * UsersScreen.jsx — إدارة المستخدمين (بنية هرمية: مدير→مندوب→مساعد)
 * منقول من camp-registry-react/src/pages/Users/UsersList.jsx (970 سطر)
 *
 * تبسيط متعمد (موثَّق): تجاهل 'SQLite أولاً' الوهمي — تحميل مباشر من
 * Supabase (نفس منطق كل الشاشات السابقة). navigator.onLine→isOnlineNow،
 * window.confirm→Alert، useNavigate→useNavigation.
 *
 * محفوظ بالكامل: البنية الشجرية (طي/فرد)، callAdminAPI (Edge Function
 * حقيقي عبر fetch عادي، شغّال بدون تعديل)، نظام الموافقة، معاينة
 * المستخدم الكاملة (محاكاة دخول فعلية عبر setPreviewAs، أو معاينة ثابتة
 * لـ platform_owner الذي لا يمكن محاكاته).
 */
import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useDataScope } from '../lib/useDataScope'
import {
  ORG_ID, callAdminAPI, supabase, visibleOrgMembers,
  isExemptFromApproval, recordApprovalRequest, isOnlineNow,
} from '../lib/db'
import { randomPassword } from '../lib/utils'
import { getCreatableRoles } from '../lib/permissions'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import SafeScreen from '../components/ui/SafeScreen'
import UserCard from '../components/users/UserCard'
import UserForm from '../components/users/UserForm'
import UserPreview from '../components/users/UserPreview'
import { ROLE_CONFIG } from '../components/users/roleConfig'
import { colors, radius } from '../theme'

const EMPTY_FORM = {
  full_name: '', national_id: '', phone: '', role: 'camp_delegate', camp_id: '',
  supervisor_id: '', assistant_camp_id: '',
  can_add: true, can_edit: true, can_delete: false, can_export: false, can_import: false,
  allowed_pages: {}, bypass_approval: false, can_review_approvals: true,
}

export default function UsersScreen() {
  const [users,          setUsers]          = useState([])
  const [pendingByUser,  setPendingByUser]  = useState({})
  const [pendingInserts, setPendingInserts] = useState(0)
  const [camps,          setCamps]          = useState([])
  const [search,         setSearch]         = useState('')
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [showAdd,        setShowAdd]        = useState(false)
  const [editUser,       setEditUser]       = useState(null)
  const [resetTarget,    setResetTarget]    = useState(null)
  const [newPass,        setNewPass]        = useState('')
  const [form,           setForm]           = useState(EMPTY_FORM)
  const [errors,         setErrors]         = useState({})
  const [collapsed,      setCollapsed]      = useState({})
  const [previewUser,    setPreviewUser]    = useState(null)

  const { profile, isOwner, isSuperAdmin, isCampDelegate, setPreviewAs } = useAuth()
  const { getAllowedCampIds, getVisibleCamps } = useDataScope()
  const navigation = useNavigation()
  const { showToast } = useApp()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: campsData }, { data: usersData }, { data: pendingData }] = await Promise.all([
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
        supabase.from('org_members').select('*').eq('org_id', ORG_ID),
        supabase.from('family_history').select('action,old_data')
          .is('family_id', null).like('action', 'user_%').eq('status', 'pending'),
      ])
      const allowedCampIds = getAllowedCampIds(campsData || [])
      setCamps(getVisibleCamps(campsData || []))
      setUsers(visibleOrgMembers(usersData || [], profile, allowedCampIds))

      const pm = {}
      ;(pendingData || []).forEach(r => { if (r.old_data?.id) pm[r.old_data.id] = r.action })
      setPendingByUser(pm)
      setPendingInserts((pendingData || []).filter(r => r.action === 'user_insert').length)
    } catch (e) {
      showToast('فشل تحميل المستخدمين: ' + e.message, true)
    } finally {
      setLoading(false)
    }
  }

  function validate() {
    const errs = {}
    if (!form.full_name.trim())   errs.full_name   = 'الاسم مطلوب'
    if (!form.national_id.trim()) errs.national_id = 'رقم الهوية مطلوب'
    else if (form.national_id.trim().length < 9) errs.national_id = 'رقم هوية غير صالح'
    if (!form.role) errs.role = 'الدور مطلوب'
    else if (!getCreatableRoles(profile).includes(form.role)) errs.role = '⛔ لا تملك صلاحية إنشاء هذا الدور'
    if (form.role === 'camp_delegate' && !form.camp_id) errs.camp_id = 'اختر المخيم'
    if (form.role === 'assistant' && !form.supervisor_id) errs.supervisor_id = 'اختر المندوب التابع له'
    return errs
  }

  /** المخيم الفعلي الذي سيُحفظ — نفس منطق الأصل بالضبط */
  function resolveCampId() {
    if (form.role === 'assistant') {
      const sup = users.find(u => u.id === form.supervisor_id)
      return form.assistant_camp_id || sup?.camp_id || null
    }
    if (form.role === 'super_admin') return null
    return form.camp_id || null
  }

  async function handleAdd() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    if (!isOnlineNow()) { showToast('إضافة مستخدم جديد تتطلب اتصالاً بالإنترنت', true); return }

    setSaving(true)
    try {
      const pass = randomPassword()
      const reviewVal = form.role !== 'assistant' ? form.can_review_approvals : false
      const payload = {
        email: `${form.national_id.trim()}@c.co`, password: pass,
        full_name: form.full_name.trim(), national_id: form.national_id.trim(),
        phone: form.phone.trim(), role: form.role,
        camp_id: resolveCampId(), org_id: ORG_ID,
        supervisor_id: form.supervisor_id || null,
        can_add: form.can_add, can_edit: form.can_edit,
        can_delete: form.can_delete, can_export: form.can_export, can_import: form.can_import,
        allowed_pages: JSON.stringify(form.allowed_pages), created_by: profile?.id,
        bypass_approval: form.bypass_approval, can_review_approvals: reviewVal,
      }

      const actorId   = profile?.user_id || profile?.id || null
      const actorName = profile?.full_name || '—'

      if (!isExemptFromApproval(profile)) {
        await recordApprovalRequest({
          familyId: null, action: 'user_insert', oldData: null, newData: payload, changes: null,
          actorId, actorName, actorRole: profile?.role || null,
        })
        showToast('✅ تم إرسال طلب الإضافة للمراجعة')
        setShowAdd(false); setForm(EMPTY_FORM)
        return
      }

      await callAdminAPI('create_user', payload)
      if (form.bypass_approval || !reviewVal) {
        try {
          await supabase.from('org_members')
            .update({ bypass_approval: form.bypass_approval, can_review_approvals: reviewVal })
            .eq('national_id', form.national_id.trim()).eq('org_id', ORG_ID)
        } catch (e2) { console.warn('[approval fields fallback]', e2.message) }
      }
      showToast('✅ تم الإنشاء — كلمة المرور: ' + pass)
      setShowAdd(false); setForm(EMPTY_FORM)
      await loadData()
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit() {
    if (!editUser) return
    if (!isOwner && !isSuperAdmin) { showToast('⛔ لا تملك صلاحية تعديل المستخدمين', true); return }

    setSaving(true)
    try {
      const updates = {
        ...editUser,
        full_name: form.full_name.trim(),
        phone: form.phone?.trim() || null,
        camp_id: resolveCampId(),
        supervisor_id: form.supervisor_id || null,
        can_add: form.can_add, can_edit: form.can_edit, can_delete: form.can_delete,
        can_export: form.can_export, can_import: form.can_import,
        allowed_pages: JSON.stringify(form.allowed_pages),
        bypass_approval: form.bypass_approval,
        can_review_approvals: form.role !== 'assistant' ? form.can_review_approvals : false,
      }
      if (isOwner) updates.role = form.role

      const actorId   = profile?.user_id || profile?.id || null
      const actorName = profile?.full_name || '—'

      if (!isExemptFromApproval(profile)) {
        await recordApprovalRequest({
          familyId: null, action: 'user_update', oldData: editUser, newData: updates, changes: null,
          actorId, actorName, actorRole: profile?.role || null,
        })
        showToast('✅ تم إرسال طلب التعديل للمراجعة')
        setEditUser(null)
        return
      }

      if (!isOnlineNow()) { showToast('⚠️ لا يوجد اتصال — لم يتم الحفظ', true); return }
      const { error } = await supabase.from('org_members').update(updates).eq('id', editUser.id)
      if (error) throw error
      setUsers(u => u.map(x => x.id === editUser.id ? updates : x))
      showToast('✅ تم التحديث')
      setEditUser(null)
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus(user) {
    if (!isOnlineNow()) { showToast('⚠️ لا يوجد اتصال', true); return }
    const newStatus = !user.is_active
    try {
      const { error } = await supabase.from('org_members').update({ is_active: newStatus }).eq('id', user.id)
      if (error) throw error
      setUsers(u => u.map(x => x.id === user.id ? { ...x, is_active: newStatus } : x))
      showToast(newStatus ? '✅ تم التفعيل' : '🚫 تم الإيقاف')
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    }
  }

  function confirmDelete(user) {
    const subCount = user.role === 'camp_delegate' ? getAssistants(user.id).length
      : user.role === 'super_admin' ? getDelegates(user.id).length + getDelegates(user.id).flatMap(d => getAssistants(d.id)).length
      : 0
    if (subCount > 0) {
      showToast(`⛔ يوجد ${subCount} مستخدم تابع لهذا الحساب — أعد تعيينهم أو احذفهم أولاً`, true)
      return
    }
    const exempt = isExemptFromApproval(profile)
    Alert.alert(
      exempt ? `حذف "${user.full_name}"؟` : `طلب حذف "${user.full_name}"؟`,
      exempt ? 'لا يمكن التراجع.' : 'بانتظار موافقة ملك المنصة.',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => deleteUser(user, exempt) },
      ]
    )
  }

  async function deleteUser(user, exempt) {
    const actorId   = profile?.user_id || profile?.id || null
    const actorName = profile?.full_name || '—'

    if (!exempt) {
      try {
        await recordApprovalRequest({
          familyId: null, action: 'user_delete', oldData: user, newData: null, changes: null,
          actorId, actorName, actorRole: profile?.role || null,
        })
        showToast('✅ تم إرسال طلب الحذف للمراجعة')
      } catch (err) { showToast('خطأ: ' + err.message, true) }
      return
    }

    if (!isOnlineNow()) { showToast('⚠️ لا يوجد اتصال — لم يتم الحذف', true); return }
    try {
      await callAdminAPI('delete_user', { user_id: user.user_id, member_id: user.id })
      setUsers(u => u.filter(x => x.id !== user.id))
      showToast('✅ تم الحذف')
    } catch (err) {
      showToast('خطأ أثناء الحذف: ' + err.message, true)
    }
  }

  async function handleResetPassword() {
    if (!newPass || newPass.length < 8) { showToast('8 أحرف على الأقل', true); return }
    setSaving(true)
    try {
      await callAdminAPI('reset_password', { user_id: resetTarget.user_id, new_password: newPass })
      showToast('✅ تم تغيير كلمة المرور')
      setResetTarget(null); setNewPass('')
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
    }
  }

  function handlePreview(user) {
    if (user.role === 'platform_owner') { setPreviewUser(user); return }
    setPreviewAs(user)
    navigation.navigate('Dashboard')
  }

  function openAdd() {
    setForm(isCampDelegate && !isOwner && !isSuperAdmin
      ? { ...EMPTY_FORM, role: 'assistant', supervisor_id: profile?.id || '' }
      : EMPTY_FORM)
    setErrors({})
    setShowAdd(true)
  }

  function openEdit(user) {
    let allowedPages = {}
    try { allowedPages = JSON.parse(user.allowed_pages || '{}') } catch { /* تجاهل صلاحيات غير صالحة */ }
    setForm({
      full_name: user.full_name || '', national_id: user.national_id || '', phone: user.phone || '',
      role: user.role || '', camp_id: user.camp_id || '', supervisor_id: user.supervisor_id || '',
      can_add: user.can_add ?? true, can_edit: user.can_edit ?? true,
      can_delete: user.can_delete ?? false, can_export: user.can_export ?? false,
      can_import: user.can_import ?? false, allowed_pages: allowedPages,
      bypass_approval: user.bypass_approval ?? false, can_review_approvals: user.can_review_approvals ?? true,
    })
    setErrors({})
    setEditUser(user)
  }

  const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))
  const admins     = users.filter(u => ['super_admin', 'platform_owner'].includes(u.role))
  const delegates  = users.filter(u => u.role === 'camp_delegate')
  const assistants = users.filter(u => u.role === 'assistant')

  const q = search.toLowerCase()
  const allFiltered = search
    ? users.filter(u => (u.full_name || '').toLowerCase().includes(q) || (u.national_id || '').includes(q))
    : users

  const getDelegates  = (adminId)    => delegates.filter(d => d.supervisor_id === adminId || d.created_by === adminId)
  const getAssistants = (delegateId) => assistants.filter(a => a.supervisor_id === delegateId || a.created_by === delegateId)
  const orphanDelegates  = delegates.filter(d => !admins.some(a => a.id === d.supervisor_id || a.id === d.created_by))
  const orphanAssistants = assistants.filter(a =>
    !delegates.some(d => d.id === a.supervisor_id || d.id === a.created_by) &&
    !admins.some(ad => ad.id === a.supervisor_id || ad.id === a.created_by)
  )
  const isMe = (id) => id === profile?.id

  const cardProps = {
    campMap, onEdit: openEdit, onToggle: handleToggleStatus, onDelete: confirmDelete,
    onReset: (u) => { setResetTarget(u); setNewPass(randomPassword()) },
    onPreview: handlePreview, isOwner, isSuperAdmin,
  }

  return (
    <SafeScreen>
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          icon="👥" title="إدارة المستخدمين" subtitle={`${users.length} مستخدم`}
          action={(isOwner || isSuperAdmin || isCampDelegate) && (
            <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
              <Text style={styles.addBtnText}>➕ إضافة</Text>
            </TouchableOpacity>
          )}
        />

        {pendingInserts > 0 && (
          <TouchableOpacity onPress={() => navigation.navigate('PendingRequests')} style={styles.pendingBanner}>
            <Text style={styles.pendingBannerText}>⏳ {pendingInserts} طلب إضافة مستخدم بانتظار المراجعة</Text>
            <Text style={styles.pendingBannerArrow}>←</Text>
          </TouchableOpacity>
        )}

        <View style={styles.statsRow}>
          {[
            ['مدير', users.filter(u => u.role === 'super_admin').length, colors.red],
            ['مندوب', users.filter(u => u.role === 'camp_delegate').length, colors.accent],
            ['مساعد', users.filter(u => u.role === 'assistant').length, colors.blue],
            ['موقوف', users.filter(u => !u.is_active).length, colors.muted],
          ].map(([label, val, color]) => (
            <View key={label} style={styles.statBox}>
              <Text style={[styles.statValue, { color }]}>{val}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <TextInput
          value={search} onChangeText={setSearch}
          placeholder="بحث بالاسم أو الهوية..." placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator color={colors.accent} size="large" /></View>
        ) : users.length === 0 ? (
          <EmptyState icon="👥" title="لا يوجد مستخدمون" />
        ) : (
          <View style={{ gap: 6 }}>
            {(search ? allFiltered.filter(u => ['super_admin', 'platform_owner'].includes(u.role)) : admins).map(admin => {
              const cfg = ROLE_CONFIG[admin.role]
              const adminDelegates = search ? [] : getDelegates(admin.id)
              const isOpen = !collapsed[admin.id]
              return (
                <View key={admin.id}>
                  <UserCard user={admin} pending={pendingByUser[admin.id]} cfg={cfg} isMe={isMe(admin.id)}
                    childCount={adminDelegates.length} isOpen={isOpen}
                    onToggleOpen={() => setCollapsed(c => ({ ...c, [admin.id]: !c[admin.id] }))}
                    {...cardProps} />
                  {isOpen && adminDelegates.map(delegate => {
                    const delegateAssistants = getAssistants(delegate.id)
                    const isDOpen = !collapsed[delegate.id]
                    return (
                      <View key={delegate.id}>
                        <UserCard user={delegate} pending={pendingByUser[delegate.id]} cfg={ROLE_CONFIG.camp_delegate}
                          isMe={isMe(delegate.id)} indent={1}
                          childCount={delegateAssistants.length} isOpen={isDOpen}
                          onToggleOpen={() => setCollapsed(c => ({ ...c, [delegate.id]: !c[delegate.id] }))}
                          {...cardProps} />
                        {isDOpen && delegateAssistants.map(asst => (
                          <UserCard key={asst.id} user={asst} pending={pendingByUser[asst.id]} cfg={ROLE_CONFIG.assistant}
                            isMe={isMe(asst.id)} indent={2} {...cardProps} />
                        ))}
                      </View>
                    )
                  })}
                </View>
              )
            })}

            {!search && orphanDelegates.length > 0 && (
              <View>
                <Text style={styles.groupLabel}>مناديب غير مرتبطين</Text>
                {orphanDelegates.map(d => (
                  <UserCard key={d.id} user={d} pending={pendingByUser[d.id]} cfg={ROLE_CONFIG.camp_delegate} isMe={isMe(d.id)} {...cardProps} />
                ))}
              </View>
            )}
            {!search && orphanAssistants.length > 0 && (
              <View>
                <Text style={styles.groupLabel}>مساعدون غير مرتبطين</Text>
                {orphanAssistants.map(a => (
                  <UserCard key={a.id} user={a} pending={pendingByUser[a.id]} cfg={ROLE_CONFIG.assistant} isMe={isMe(a.id)} {...cardProps} />
                ))}
              </View>
            )}
            {search && allFiltered.filter(u => !['super_admin', 'platform_owner'].includes(u.role)).map(u => (
              <UserCard key={u.id} user={u} pending={pendingByUser[u.id]} cfg={ROLE_CONFIG[u.role] || ROLE_CONFIG.assistant} isMe={isMe(u.id)} {...cardProps} />
            ))}
          </View>
        )}
      </ScrollView>

      <UserForm
        visible={showAdd} onClose={() => setShowAdd(false)} mode="add"
        form={form} setForm={setForm} errors={errors}
        creatableRoles={getCreatableRoles(profile)} camps={camps} users={users}
        profile={profile} isOwner={isOwner} isCampDelegate={isCampDelegate} isSuperAdmin={isSuperAdmin}
        onSave={handleAdd} saving={saving}
      />
      <UserForm
        visible={!!editUser} onClose={() => setEditUser(null)} mode="edit" editUser={editUser}
        form={form} setForm={setForm} errors={errors}
        creatableRoles={getCreatableRoles(profile)} camps={camps} users={users}
        profile={profile} isOwner={isOwner} isCampDelegate={isCampDelegate} isSuperAdmin={isSuperAdmin}
        onSave={handleEdit} saving={saving}
      />

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title="🔑 إعادة تعيين كلمة المرور" size="sm">
        {resetTarget && (
          <View style={{ gap: 14 }}>
            <Text style={styles.resetLabel}>المستخدم: <Text style={{ color: colors.white, fontWeight: '700' }}>{resetTarget.full_name}</Text></Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={newPass} onChangeText={setNewPass} style={[styles.searchInput, { flex: 1, textAlign: 'left' }]} />
              <TouchableOpacity onPress={() => setNewPass(randomPassword())} style={styles.shuffleBtn}>
                <Text>🔀</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={handleResetPassword} disabled={saving} style={[styles.addBtn, styles.fullWidthBtn, saving && { opacity: 0.6 }]}>
              <Text style={styles.addBtnText}>{saving ? 'جاري التغيير...' : '✅ تغيير كلمة المرور'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>

      {previewUser && (
        <UserPreview user={previewUser} camps={camps} users={users} onClose={() => setPreviewUser(null)} />
      )}
    </View>
    </SafeScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: colors.bg, fontWeight: '900', fontSize: 13, textAlign: 'center' },
  fullWidthBtn: { paddingVertical: 12 },
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: radius.md, padding: 12, marginBottom: 12,
  },
  pendingBannerText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  pendingBannerArrow: { color: colors.accent, fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 8, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 9, marginTop: 2 },
  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 12,
  },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  groupLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', paddingVertical: 8, marginTop: 8 },
  resetLabel: { color: colors.muted, fontSize: 13 },
  shuffleBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, justifyContent: 'center' },
})
