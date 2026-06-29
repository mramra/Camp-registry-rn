/**
 * db.js — كل ما يتصل بقاعدة البيانات (Supabase) بملف واحد موحَّد
 * ════════════════════════════════════════════════════════════
 * منقول حرفياً (نفس المنطق) من camp-registry-react/src/lib/db.js
 * كل قراءة وكتابة في النظام تذهب مباشرة لـ Supabase. لا SQLite، لا
 * PowerSync، لا تخزين محلي من أي نوع. التطبيق يحتاج اتصالاً بالإنترنت.
 *
 * التكييفات الوحيدة المطلوبة لـ React Native (لا تغيير في منطق الأعمال):
 *   - navigator.onLine (غير موجود في RN) → استبدل بمتغيّر isOnline من NetInfo،
 *     يُحدَّث عبر listener عام ويُقرأ بشكل متزامن من isOnlineNow()
 *   - getDeviceFingerprint() أصبحت async (SecureStore) → checkDeviceApproval تستخدم await
 *
 * الأقسام (مطابقة للأصل):
 *   1. العميل والاتصال (client, ORG_ID, callAdminAPI)
 *   2. تعريفات الجداول (مصدر الحقيقة الوحيد لبنية قاعدة البيانات)
 *   3. عمليات CRUD عامة (useLocalDB) — الاسم بقي كما هو للتوافق مع منطق الصفحات المنقولة
 *   4. نظام موافقة platform_owner على عمليات الأسر
 *   5. سجل نشاط الأسر (إضافة/تعديل/حذف)
 *   6. اعتماد الأجهزة (Device Approval)
 *   8. نسخة احتياطية شاملة (بيانات + هيكلية)
 */
import { createClient } from '@supabase/supabase-js'
import { useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import 'react-native-url-polyfill/auto'
import { getDeviceFingerprint, getDeviceName, getDeviceType, generateId } from './utils'

// ════════════════════════════════════════════════════════════
// 1. العميل والاتصال
// ════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://ojclpkenecicujkqhhlu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu'
export const ORG_ID = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5'
export const PLATFORM_OWNER_ID = '583dce20-a25f-41b3-824e-6568bf4989ae'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// ── حالة الاتصال بالإنترنت — بديل navigator.onLine في React Native ──
// NetInfo لا يوفر قراءة متزامنة فورية، فنحتفظ بآخر حالة معروفة في متغيّر
// محلي يُحدَّث عبر listener عام يبدأ مع تحميل التطبيق (انظر AppContext).
let _isOnline = true
NetInfo.addEventListener((state) => {
  _isOnline = state.isConnected !== false && state.isInternetReachable !== false
})
/** يكافئ navigator.onLine في نسخة الويب */
export function isOnlineNow() { return _isOnline }

/** دالة تغليف: تستدعي Edge Function للـ Admin API */
export async function callAdminAPI(action, payload) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ════════════════════════════════════════════════════════════
// 2. تعريفات الجداول — مصدر الحقيقة الوحيد لبنية قاعدة البيانات
//
// كل عمود هنا تم تأكيده فعلياً من Supabase (فحص مباشر، لا تخمين).
// منقول حرفياً من db.js الأصلي — تاريخ آخر تأكيد هناك: 2026-06-20
//
// ⚠️ ملاحظة: family_members.disabilities / injuries / chronic_diseases /
// female_status هي مصفوفات (array) حقيقية في Postgres، تُرسَل وتُستقبَل
// كمصفوفة JS عادية عبر REST مباشرة — لا حاجة لـ JSON.parse عند الكتابة.
// ════════════════════════════════════════════════════════════

export const TABLES = {
  families: {
    columns: [
      'id', 'org_id', 'camp_id', 'head_name', 'head_id', 'head_dob', 'head_gender',
      'phone1', 'phone2', 'notes', 'version', 'created_at', 'updated_at',
      'head_marital', 'tent', 'original_address', 'address_details',
      'head_photo_url', 'address', 'tags', 'entry_date', 'exit_date', 'exit_reason',
      'transferred_to_camp_id', 'client_id', 'created_by', 'updated_by', 'tent2',
      'category_tags', 'category_details', 'economic_level',
      'head_orphan_status', 'head_orphan_cause', 'head_disabilities',
      'head_injuries', 'head_chronic_diseases', 'head_female_status', '_deleted',
      'review_status', 'pending_delete',
    ],
    jsonTextColumns: ['tags', 'category_tags', 'category_details',
      'head_disabilities', 'head_injuries', 'head_chronic_diseases', 'head_female_status'],
    requiredOnInsert: ['org_id', 'head_name'],
  },

  family_members: {
    columns: [
      'id', 'family_id', 'name', 'relation', 'national_id', 'dob', 'gender',
      'created_at', 'health', 'orphan_status', 'orphan_cause',
      'disabilities', 'injuries', 'chronic_diseases', 'female_status',
      'updated_at', '_deleted',
    ],
    arrayColumns: ['disabilities', 'injuries', 'chronic_diseases', 'female_status'],
    requiredOnInsert: ['family_id', 'name'],
  },

  camps: {
    columns: [
      'id', 'org_id', 'name', 'status', 'address', 'latitude', 'longitude',
      'capacity', 'manager_id', 'created_at', 'facilities', 'portal_open',
      'parent_camp_id', 'camp_type', 'updated_at', '_deleted',
    ],
    requiredOnInsert: ['org_id', 'name'],
  },

  org_members: {
    columns: [
      'id', 'org_id', 'user_id', 'camp_id', 'role', 'full_name', 'phone',
      'is_active', 'created_at', 'national_id', 'must_change_pass',
      'can_add', 'can_edit', 'can_delete', 'last_sync', 'can_export', 'can_import',
      'created_by', 'page_permissions', 'delegate_camps', 'supervisor_id',
      'allowed_pages', '_deleted', 'updated_at', 'bypass_approval',
    ],
    jsonTextColumns: ['allowed_pages'],
    requiredOnInsert: ['org_id', 'role', 'full_name'],
  },

  family_movements: {
    columns: [
      'id', 'family_id', 'org_id', 'type', 'from_camp', 'to_camp', 'date',
      'reason', 'notes', 'created_by', 'created_at', 'updated_at', '_deleted',
    ],
    requiredOnInsert: ['family_id', 'org_id', 'type'],
  },

  dist_rounds: {
    columns: [
      'id', 'org_id', 'camp_id', 'name', 'type', 'status', 'created_at',
      'tags', 'seq', 'prev_round_id', 'updated_at', '_deleted',
    ],
    requiredOnInsert: ['org_id', 'name'],
  },

  camp_distributions: {
    columns: [
      'id', 'org_id', 'camp_id', 'description', 'quantity', 'type', 'status',
      'distributed_at', 'created_at', 'round_id', 'updated_at', '_deleted',
    ],
    requiredOnInsert: ['org_id', 'camp_id', 'description'],
  },

  camp_dist_families: {
    columns: [
      'id', 'distribution_id', 'family_id', 'received_at', 'notes',
      'round_id', 'org_id', 'updated_at', '_deleted',
    ],
    requiredOnInsert: ['distribution_id', 'family_id'],
  },

  family_history: {
    columns: [
      'id', 'family_id', 'org_id', 'action', 'changed_by', 'user_name', 'user_role',
      'old_data', 'new_data', 'changes', 'created_at', 'updated_at', '_deleted',
      'status', 'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'review_note',
    ],
    requiredOnInsert: ['org_id', 'action'],
  },
}

/** يُبقي فقط الأعمدة الموجودة فعلياً في الجدول المطلوب */
export function cleanForTable(table, record) {
  const def = TABLES[table]
  if (!def) return record
  const out = {}
  for (const key of Object.keys(record)) {
    if (def.columns.includes(key)) out[key] = record[key]
  }
  return out
}

/** يحوّل أعمدة JSON-text من نص إلى مصفوفة/كائن عند القراءة */
export function parseJsonColumns(table, record) {
  const def = TABLES[table]
  if (!def?.jsonTextColumns) return record
  const out = { ...record }
  for (const col of def.jsonTextColumns) {
    if (typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]) } catch { /* يبقى كما هو */ }
    }
  }
  return out
}

/** فحص سريع: هل كل الأعمدة المطلوبة موجودة في السجل؟ */
export function validateRequired(table, record) {
  const def = TABLES[table]
  if (!def) return { valid: true }
  const missing = def.requiredOnInsert.filter(k => record[k] === undefined || record[k] === null || record[k] === '')
  return { valid: missing.length === 0, missing }
}

// ════════════════════════════════════════════════════════════
// 3. عمليات CRUD عامة
// ════════════════════════════════════════════════════════════

const ORG_SCOPED = new Set([
  'families', 'camps', 'org_members', 'family_movements',
  'dist_rounds', 'camp_distributions', 'page_permissions',
])

function parseRow(row) {
  return row
}

export function useLocalDB() {
  const query = useCallback(async (table, filters = {}, options = {}) => {
    const { limit, offset, orderBy } = options
    try {
      let q = supabase.from(table).select('*')
      if (ORG_SCOPED.has(table) && !('org_id' in filters)) q = q.eq('org_id', ORG_ID)
      Object.keys(filters).forEach(k => { q = q.eq(k, filters[k]) })
      if (orderBy) {
        const desc = orderBy.startsWith('-')
        q = q.order(desc ? orderBy.slice(1) : orderBy, { ascending: !desc })
      }
      if (limit)  q = q.limit(Number(limit))
      if (offset) q = q.range(Number(offset), Number(offset) + Number(limit || 50) - 1)

      const { data, error } = await q
      if (error) { console.warn(`[db] ${table}:`, error.message); return [] }
      return (data || []).map(parseRow)
    } catch (e) {
      console.warn(`[db] ${table}:`, e.message)
      return []
    }
  }, [])

  const count = useCallback(async (table, filters = {}) => {
    if (!isOnlineNow()) return 0
    try {
      let q = supabase.from(table).select('id', { count: 'exact', head: true })
      if (ORG_SCOPED.has(table) && !('org_id' in filters)) q = q.eq('org_id', ORG_ID)
      Object.keys(filters).forEach(k => { q = q.eq(k, filters[k]) })
      const { count: c, error } = await q
      if (error) return 0
      return c || 0
    } catch { return 0 }
  }, [])

  const bulkUpsert = useCallback(async (table, docs) => {
    if (!docs?.length) return
    if (!isOnlineNow()) {
      console.warn(`[db] لا يوجد اتصال — تعذر حفظ ${table}`)
      throw new Error('لا يوجد اتصال بالإنترنت — لا يمكن الحفظ الآن')
    }
    const now = new Date().toISOString()
    const prepared = docs.map(d => cleanForTable(table, {
      ...d,
      org_id: d.org_id || (ORG_SCOPED.has(table) ? ORG_ID : d.org_id),
      updated_at: d.updated_at || now,
    }))
    const { error } = await supabase.from(table).upsert(prepared)
    if (error) {
      console.warn(`[db] bulkUpsert ${table}:`, error.message)
      throw error
    }
  }, [])

  const upsert = useCallback(async (table, data) => {
    await bulkUpsert(table, [data])
    return data
  }, [bulkUpsert])

  const remove = useCallback(async (table, id) => {
    if (!isOnlineNow()) {
      throw new Error('لا يوجد اتصال بالإنترنت — لا يمكن الحذف الآن')
    }
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      console.warn(`[db] remove ${table}:`, error.message)
      throw error
    }
  }, [])

  return { ready: isOnlineNow(), query, count, upsert, bulkUpsert, remove }
}

// ════════════════════════════════════════════════════════════
// 4. نظام موافقة platform_owner على عمليات الأسر
// ════════════════════════════════════════════════════════════

export function isExemptFromApproval(profile) {
  if (!profile) return false
  return profile.role === 'platform_owner' || profile.bypass_approval === true
}

export function visibleFamilies(fams, isOwner) {
  if (isOwner) return fams
  return fams.filter(f => !f.pending_delete)
}

export function visibleOrgMembers(members, profile, allowedCampIds) {
  if (!profile) return []
  if (profile.role === 'platform_owner' || allowedCampIds === null) return members
  const inScopeIds = new Set(
    members.filter(m => allowedCampIds.includes(m.camp_id)).map(m => m.id)
  )
  return members.filter(m =>
    m.id === profile.id ||
    allowedCampIds.includes(m.camp_id) ||
    inScopeIds.has(m.supervisor_id)
  )
}

export function canUserReviewRequest(profile, requesterUser) {
  if (!profile || !requesterUser) return false
  if (profile.role === 'platform_owner') return true
  if (!profile.can_review_approvals) return false

  if (profile.role === 'camp_delegate' && requesterUser.role === 'assistant') {
    return requesterUser.supervisor_id === profile.id
  }
  if (profile.role === 'super_admin' && ['assistant', 'camp_delegate'].includes(requesterUser.role)) {
    return true
  }
  return false
}

export async function recordApprovalRequest({ familyId, action, oldData, newData, changes, actorId, actorName, actorRole }) {
  try {
    await supabase.from('family_history').insert({
      org_id: ORG_ID,
      family_id: familyId,
      action,
      changed_by: actorId || null,
      user_name: actorName || '—',
      user_role: actorRole || null,
      old_data: oldData || null,
      new_data: newData || null,
      changes: changes || null,
      status: 'pending',
    })
    if (action === 'delete' && familyId) {
      await supabase.from('families').update({ pending_delete: true }).eq('id', familyId)
    }
  } catch (e) {
    console.warn('[recordApprovalRequest]', e.message)
    throw e
  }
}

export async function fetchPendingRequests() {
  try {
    const { data, error } = await supabase
      .from('family_history')
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[fetchPendingRequests]', e.message)
    return []
  }
}

export async function fetchDecisionLog(limit = 100) {
  try {
    const { data, error } = await supabase
      .from('family_history')
      .select('*')
      .eq('org_id', ORG_ID)
      .in('status', ['approved', 'rejected'])
      .order('reviewed_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[fetchDecisionLog]', e.message)
    return []
  }
}

export async function approveRequest(req, reviewer) {
  try {
    const { family_id, action, new_data, old_data } = req

    if (action === 'delete') {
      await supabase.from('family_members').delete().eq('family_id', family_id)
      await supabase.from('families').delete().eq('id', family_id)
    } else if (action === 'camp_insert') {
      await supabase.from('camps').insert(new_data)
    } else if (action === 'camp_update') {
      await supabase.from('camps').update(new_data).eq('id', new_data.id)
    } else if (action === 'camp_delete') {
      await supabase.from('camps').delete().eq('id', old_data.id)
    } else if (action === 'user_insert') {
      await callAdminAPI('create_user', new_data)
    } else if (action === 'user_update') {
      await supabase.from('org_members').update(new_data).eq('id', new_data.id)
    } else if (action === 'user_delete') {
      await callAdminAPI('delete_user', { user_id: old_data.user_id, member_id: old_data.id })
    } else if (action?.startsWith('movement_')) {
      await supabase.from('family_movements').insert(new_data)
    } else {
      await supabase.from('families').update({ review_status: 'approved' }).eq('id', family_id)
    }

    await supabase.from('family_history').update({
      status: 'approved',
      reviewed_by: reviewer?.user_id || reviewer?.id || null,
      reviewed_by_name: reviewer?.full_name || '—',
      reviewed_by_role: reviewer?.role || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id)

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function rejectRequest(req, reviewer, note) {
  try {
    const { family_id, action, old_data } = req

    if (action === 'insert') {
      await supabase.from('families').update({ review_status: 'rejected' }).eq('id', family_id)
    } else if (action === 'update' && old_data) {
      const restoreData = { ...old_data }
      delete restoreData.id
      await supabase.from('families').update(restoreData).eq('id', family_id)
    } else if (action === 'delete') {
      await supabase.from('families').update({ pending_delete: false }).eq('id', family_id)
    }

    await supabase.from('family_history').update({
      status: 'rejected',
      reviewed_by: reviewer?.user_id || reviewer?.id || null,
      reviewed_by_name: reviewer?.full_name || '—',
      reviewed_by_role: reviewer?.role || null,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    }).eq('id', req.id)

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ════════════════════════════════════════════════════════════
// 5. سجل نشاط الأسر (إضافة / تعديل / حذف)
// ════════════════════════════════════════════════════════════

export const TRACKED_FIELDS = {
  head_name:        'اسم رب الأسرة',
  head_id:           'رقم الهوية',
  head_gender:       'الجنس',
  head_dob:          'تاريخ الميلاد',
  head_marital:      'الحالة الاجتماعية',
  phone1:            'الهاتف 1',
  phone2:            'الهاتف 2',
  camp_id:           'المخيم',
  tent:              'الخيمة',
  original_address:  'العنوان الأصلي',
  address_details:   'تفاصيل العنوان',
  notes:             'ملاحظات',
  economic_level:    'المستوى الاقتصادي',
  status:            'الحالة',
}

export function diffFamilyFields(oldData, newData, valueResolvers = {}) {
  const changes = {}
  for (const field of Object.keys(TRACKED_FIELDS)) {
    const oldRaw = oldData?.[field] ?? null
    const newRaw = newData?.[field] ?? null
    const oldStr = oldRaw === null || oldRaw === '' ? null : String(oldRaw)
    const newStr = newRaw === null || newRaw === '' ? null : String(newRaw)
    if (oldStr !== newStr) {
      const resolve = valueResolvers[field]
      changes[field] = {
        old: resolve && oldStr ? resolve(oldStr) : oldStr,
        new: resolve && newStr ? resolve(newStr) : newStr,
      }
    }
  }
  return changes
}

export async function logFamilyActivity({ familyId, familyName, membersCount, action, actorId, actorName, changes }) {
  try {
    if (!isOnlineNow()) return
    await supabase.from('family_activity_log').insert({
      org_id:        ORG_ID,
      family_id:     familyId || null,
      family_name:   familyName || '—',
      members_count: membersCount || 0,
      action,
      actor_id:      actorId || null,
      actor_name:    actorName || '—',
      changes:       changes && Object.keys(changes).length ? changes : null,
    })
  } catch (e) {
    console.warn('[logFamilyActivity]', e.message)
  }
}

export async function fetchRecentFamilyActivity(limit = 5, allowedFamilyIds = null) {
  try {
    const fetchLimit = allowedFamilyIds ? Math.max(limit * 5, 50) : limit
    const { data, error } = await supabase
      .from('family_activity_log')
      .select('*')
      .eq('org_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(fetchLimit)
    if (error) throw error
    let rows = data || []
    if (allowedFamilyIds) {
      const allowedSet = allowedFamilyIds instanceof Set ? allowedFamilyIds : new Set(allowedFamilyIds)
      rows = rows.filter(r => r.family_id && allowedSet.has(r.family_id))
    }
    return rows.slice(0, limit)
  } catch (e) {
    console.warn('[fetchRecentFamilyActivity]', e.message)
    return []
  }
}

// ════════════════════════════════════════════════════════════
// 6. اعتماد الأجهزة (Device Approval)
// ════════════════════════════════════════════════════════════

export const NEXT_DEVICE_APPROVER = {
  assistant:     'مندوبك أو مدير الإيواء',
  camp_delegate: 'مدير الإيواء أو ملك المنصة',
  super_admin:   'ملك المنصة',
}

/**
 * يفحص/يسجّل جهاز هذا المستخدم عند الدخول.
 * ⚠️ خلافاً للأصل: getDeviceFingerprint() أصبحت async (SecureStore بدل localStorage)
 * لذلك هذه الدالة تستخدم await فيها — السلوك المنطقي مطابق تماماً للأصل.
 */
export async function checkDeviceApproval(userId, profile) {
  try {
    if (!profile) return { ok: true, status: 'no_profile' }
    const isPlatformOwner = profile.role === 'platform_owner'
    const fingerprint = await getDeviceFingerprint()
    const now = new Date().toISOString()

    const { data: existing } = await supabase.from('devices')
      .select('*').eq('user_id', userId).eq('fingerprint', fingerprint).limit(1)
    const dev = existing?.[0]

    if (!dev) {
      await supabase.from('devices').insert({
        id: generateId(), org_id: ORG_ID, user_id: userId, fingerprint,
        device_name: getDeviceName(), device_type: getDeviceType(),
        is_approved: isPlatformOwner, is_blocked: false,
        last_seen: now, created_at: now,
      })
      return isPlatformOwner
        ? { ok: true, status: 'owner' }
        : { ok: false, status: 'pending', role: profile.role }
    }

    if (isPlatformOwner) return { ok: true, status: 'owner' }

    if (dev.is_blocked)   return { ok: false, status: 'blocked', role: profile.role }
    if (!dev.is_approved) return { ok: false, status: 'pending', role: profile.role }

    await supabase.from('devices').update({ last_seen: now }).eq('id', dev.id)
    return { ok: true, status: 'approved' }
  } catch (e) {
    console.warn('[checkDeviceApproval]', e.message)
    return { ok: true, status: 'error' }
  }
}

async function logDeviceAudit(action, device, reviewer) {
  try {
    await supabase.from('audit_logs').insert({
      org_id:      ORG_ID,
      user_id:     reviewer?.user_id || reviewer?.id || null,
      user_name:   reviewer?.full_name || '—',
      user_role:   reviewer?.role || null,
      device_id:   device.id,
      action,
      target_id:   device.user_id,
      target_name: device.owner_name || null,
      details:     { device_name: device.device_name, device_type: device.device_type },
    })
  } catch (e) { console.warn('[logDeviceAudit]', e.message) }
}

export async function approveDevice(device, reviewer) {
  const { error } = await supabase.from('devices')
    .update({ is_approved: true, is_blocked: false }).eq('id', device.id)
  if (error) throw error
  logDeviceAudit('device_approved', device, reviewer)
}

export async function blockDevice(device, reviewer) {
  const { error } = await supabase.from('devices')
    .update({ is_blocked: true, is_approved: false }).eq('id', device.id)
  if (error) throw error
  logDeviceAudit('device_blocked', device, reviewer)
}

export async function unblockDevice(device, reviewer) {
  const { error } = await supabase.from('devices').update({ is_blocked: false }).eq('id', device.id)
  if (error) throw error
  logDeviceAudit('device_unblocked', device, reviewer)
}

export async function fetchDeviceAuditMap(deviceIds) {
  if (!deviceIds?.length) return {}
  try {
    const { data } = await supabase.from('audit_logs')
      .select('*').eq('org_id', ORG_ID).in('device_id', deviceIds)
      .order('created_at', { ascending: false })
    const map = {}
    ;(data || []).forEach(row => { if (!map[row.device_id]) map[row.device_id] = row })
    return map
  } catch (e) { console.warn('[fetchDeviceAuditMap]', e.message); return {} }
}

// ════════════════════════════════════════════════════════════
// 8. نسخة احتياطية شاملة (بيانات + هيكلية) — لملك المنصة فقط
// ════════════════════════════════════════════════════════════

export const ALL_TABLES = [
  'families', 'family_members', 'camps', 'org_members', 'family_movements',
  'dist_rounds', 'camp_distributions', 'camp_dist_families', 'distributions', 'distribution_families',
  'family_history', 'devices', 'audit_logs', 'family_activity_log', 'page_permissions',
  'assistant_camps', 'delegate_camps', 'member_camps', 'civil_registry', 'duplicate_alerts',
  'notifications', 'push_subscriptions', 'sms_logs', 'subscriptions', 'sync_queue',
  'user_preferences', 'organizations',
]

const TABLES_WITHOUT_ORG_ID = ['family_members', 'member_camps', 'distribution_families', 'organizations']

export async function fetchAllTablesData() {
  const result = {}
  await Promise.all(ALL_TABLES.map(async (t) => {
    try {
      let q = supabase.from(t).select('*')
      if (!TABLES_WITHOUT_ORG_ID.includes(t)) q = q.eq('org_id', ORG_ID)
      const { data, error } = await q
      result[t] = error ? { error: error.message } : (data || [])
    } catch (e) { result[t] = { error: e.message } }
  }))
  return result
}

export async function fetchFullSchema() {
  const { data, error } = await supabase.rpc('export_full_schema')
  if (error) throw error
  return data
}

export async function logBackupCreated(actor) {
  try {
    await supabase.from('audit_logs').insert({
      org_id: ORG_ID, user_id: actor?.user_id || null, user_name: actor?.full_name || '—',
      user_role: actor?.role || null, action: 'backup_created',
      target_id: null, target_name: null, details: { source: 'data_page' },
    })
  } catch (e) { console.warn('[logBackupCreated]', e.message) }
}

export async function fetchLastBackupDate() {
  try {
    const { data } = await supabase.from('audit_logs')
      .select('created_at').eq('org_id', ORG_ID).eq('action', 'backup_created')
      .order('created_at', { ascending: false }).limit(1)
    return data?.[0]?.created_at || null
  } catch (e) { console.warn('[fetchLastBackupDate]', e.message); return null }
}
