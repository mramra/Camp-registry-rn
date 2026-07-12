import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { getDeviceFingerprint, getDeviceName, getDeviceType } from './utils';

const SUPABASE_URL = 'https://ojclpkenecicujkqhhlu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// توصية Supabase الرسمية لـ React Native: autoRefreshToken وحده ما يكفي --
// لازم ربطه صراحة بحالة التطبيق (نشط/خلفية)، وإلا رمز الجلسة ينتهي بصمت
// وهو بالخلفية (التوكن ما يتجدد إلا لو التطبيق "نشط" فعلياً)، فيضطر
// المستخدم يسجّل دخول من جديد رغم إن persistSession مفعّل وسليم.
// راجع: https://supabase.com/docs/reference/javascript/auth-startautorefresh
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

/** استدعاء Edge Function للعمليات الإدارية (إنشاء/حذف مستخدم، إعادة تعيين كلمة مرور) */
export const callAdminAPI = async (action, payload) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

// =========== Helper Functions ===========

export const fetchFamilies = async (orgId, campId = null) => {
  try {
    let q = supabase
      .from('families')
      .select('id, org_id, camp_id, head_name, head_id, head_gender, head_dob, head_marital, phone1, phone2, category_tags, review_status, pending_delete, created_at, tent, head_female_status, head_chronic_diseases, head_disabilities, head_injuries, head_needs, head_orphan_status, exit_date, entry_date')
      .eq('org_id', orgId)
      .eq('_deleted', false)
      .is('exit_date', null)
      .order('created_at', { ascending: false });

    if (campId) q = q.eq('camp_id', campId);

    const { data, error } = await q;
    if (error) throw error;
    return (data || []).filter((f) => !f.pending_delete);
  } catch (err) {
    console.error('[fetchFamilies]', err.message);
    return [];
  }
};

export const fetchFamilyMembers = async (familyIds) => {
  if (!familyIds || familyIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('family_members')
      .select(
        'id, family_id, name, relation, national_id, dob, gender, health, ' +
        'orphan_status, orphan_cause, disabilities, injuries, chronic_diseases, female_status, needs'
      )
      .in('family_id', familyIds)
      .eq('_deleted', false);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[fetchFamilyMembers]', err.message);
    return [];
  }
};

export const fetchDashboardStats = async (orgId) => {
  try {
    const [familiesRes, membersRes, campsRes] = await Promise.all([
      supabase.from('families').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('_deleted', false),
      supabase.from('family_members').select('id', { count: 'exact', head: true }).eq('_deleted', false),
      supabase.from('camps').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('_deleted', false),
    ]);

    return {
      totalFamilies: familiesRes.count || 0,
      totalMembers: membersRes.count || 0,
      totalCamps: campsRes.count || 0,
    };
  } catch (err) {
    console.error('[fetchDashboardStats]', err.message);
    return {
      totalFamilies: 0,
      totalMembers: 0,
      totalCamps: 0,
    };
  }
};

export const fetchCamps = async (orgId) => {
  try {
    const { data, error } = await supabase
      .from('camps')
      .select('id, org_id, name, status, address, capacity, manager_id, parent_camp_id, camp_type, latitude, longitude, created_at')
      .eq('org_id', orgId)
      .eq('_deleted', false)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[fetchCamps]', err.message);
    return [];
  }
};

// عدد الأسر بكل مخيم (لعرضه ببطاقة المخيم بدون جلب كل الأسر)
export const fetchCampFamilyCounts = async (orgId) => {
  const { data, error } = await supabase
    .from('families')
    .select('camp_id')
    .eq('org_id', orgId)
    .eq('_deleted', false);

  if (error) throw error;
  const counts = {};
  (data || []).forEach((f) => {
    if (!f.camp_id) return;
    counts[f.camp_id] = (counts[f.camp_id] || 0) + 1;
  });
  return counts;
};

// أعضاء المنظمة (لعرض اسم مندوب/مدير كل مخيم واختيار مدير عند الإضافة)
export const fetchOrgMembers = async (orgId) => {
  const { data, error } = await supabase
    .from('org_members')
    .select(
      'id, user_id, org_id, full_name, national_id, phone, role, camp_id, supervisor_id, ' +
      'can_add, can_edit, can_delete, can_export, can_import, bypass_approval, ' +
      'can_review_approvals, is_active, must_change_pass, created_at'
    )
    .eq('org_id', orgId)
    .eq('_deleted', false);

  if (error) throw error;
  return data || [];
};

export const updateOrgMember = async (memberId, updates) => {
  try {
    const { data, error } = await supabase
      .from('org_members')
      .update(updates)
      .eq('id', memberId)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const createCamp = async (campData) => {
  try {
    const { data, error } = await supabase.from('camps').insert([campData]).select();
    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const updateCamp = async (campId, updates) => {
  try {
    const { data, error } = await supabase
      .from('camps')
      .update(updates)
      .eq('id', campId)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const deleteCamp = async (campId) => {
  try {
    const { error } = await supabase.from('camps').delete().eq('id', campId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── إدارة الأجهزة (devices) مع اعتماد هرمي ───────────────
export const fetchDevices = async (orgId) => {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('org_id', orgId)
    .order('last_seen', { ascending: false });
  if (error) throw error;
  return data || [];
};

/**
 * فحص/تسجيل الجهاز عند تسجيل الدخول -- منقولة حرفياً من camp-registry-react
 * (كانت ناقصة بالكامل بـRN: getDeviceFingerprint موجودة بس محدش يستدعيها،
 * فجدول devices ما كان يتعبى أبداً وشاشة الأجهزة تفضل فاضية للأبد).
 *
 * مالك المنصة: يُسجَّل الجهاز للعرض فقط (is_approved=true تلقائياً) ولا يُحجب أبداً.
 * غيره: جهاز جديد → يُسجَّل "قيد الموافقة" ويُحجب؛ محظور → حجب نهائي؛ غير معتمد → حجب بانتظار المراجعة.
 * عند أي عطل غير متوقع (شبكة، إلخ) لا نحجب الدخول — تجنباً لقفل المستخدمين بسبب خلل مؤقت.
 * يُرجع: { ok, status: 'owner'|'approved'|'pending'|'blocked'|'error', role? }
 */
export const checkDeviceApproval = async (userId, profile) => {
  try {
    if (!profile) return { ok: true, status: 'no_profile' };
    const isPlatformOwner = profile.role === 'platform_owner';
    const fingerprint = await getDeviceFingerprint();
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', userId)
      .eq('fingerprint', fingerprint)
      .limit(1);
    const dev = existing?.[0];

    if (!dev) {
      await supabase.from('devices').insert({
        org_id: profile.org_id,
        user_id: userId,
        fingerprint,
        device_name: getDeviceName(),
        device_type: getDeviceType(),
        is_approved: isPlatformOwner,
        is_blocked: false,
        last_seen: now,
        created_at: now,
      });
      return isPlatformOwner
        ? { ok: true, status: 'owner' }
        : { ok: false, status: 'pending', role: profile.role };
    }

    if (isPlatformOwner) return { ok: true, status: 'owner' }; // معفى دائماً بصرف النظر عن حالة السجل

    if (dev.is_blocked) return { ok: false, status: 'blocked', role: profile.role };
    if (!dev.is_approved) return { ok: false, status: 'pending', role: profile.role };

    await supabase.from('devices').update({ last_seen: now }).eq('id', dev.id);
    return { ok: true, status: 'approved' };
  } catch (e) {
    console.warn('[checkDeviceApproval]', e.message);
    return { ok: true, status: 'error' };
  }
};

const logDeviceAudit = async (action, device, reviewer, orgId) => {
  try {
    await supabase.from('audit_logs').insert({
      org_id: orgId,
      user_id: reviewer?.user_id || reviewer?.id || null,
      user_name: reviewer?.full_name || '—',
      user_role: reviewer?.role || null,
      device_id: device.id,
      action,
      target_id: device.user_id,
      target_name: device.owner_name || null,
    });
  } catch (e) {
    console.warn('[logDeviceAudit]', e.message);
  }
};

export const approveDevice = async (device, reviewer, orgId) => {
  const { error } = await supabase.from('devices').update({ is_approved: true, is_blocked: false }).eq('id', device.id);
  if (error) throw error;
  await logDeviceAudit('device_approved', device, reviewer, orgId);
};

export const blockDevice = async (device, reviewer, orgId) => {
  const { error } = await supabase.from('devices').update({ is_blocked: true, is_approved: false }).eq('id', device.id);
  if (error) throw error;
  await logDeviceAudit('device_blocked', device, reviewer, orgId);
};

export const unblockDevice = async (device, reviewer, orgId) => {
  const { error } = await supabase.from('devices').update({ is_blocked: false }).eq('id', device.id);
  if (error) throw error;
  await logDeviceAudit('device_unblocked', device, reviewer, orgId);
};

export const removeDevice = async (deviceId) => {
  const { error } = await supabase.from('devices').delete().eq('id', deviceId);
  if (error) throw error;
};

export const fetchDeviceAuditMap = async (orgId, deviceIds) => {
  if (!deviceIds?.length) return {};
  try {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('org_id', orgId)
      .in('device_id', deviceIds)
      .order('created_at', { ascending: false });
    const map = {};
    (data || []).forEach((row) => {
      if (!map[row.device_id]) map[row.device_id] = row;
    });
    return map;
  } catch (e) {
    console.warn('[fetchDeviceAuditMap]', e.message);
    return {};
  }
};

// ── سجل التغييرات الحقيقي (family_activity_log) ──────────
export const fetchAuditLog = async (orgId, limit = 300) => {
  const { data, error } = await supabase
    .from('family_activity_log')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

// ── صلاحيات الصفحات التفصيلية (page_permissions) ───────
export const fetchAllPagePermissions = async (orgId) => {
  const { data, error } = await supabase.from('page_permissions').select('*').eq('org_id', orgId);
  if (error) throw error;
  return (data || []).map((r) => ({ ...r, allowed: !!r.allowed }));
};

export const setPagePermission = async ({ orgId, scope, scopeValue, pageKey, allowed, updatedBy }) => {
  const { error } = await supabase.from('page_permissions').upsert(
    {
      org_id: orgId,
      scope,
      scope_value: scopeValue,
      page_key: pageKey,
      allowed,
      updated_by: updatedBy || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,scope,scope_value,page_key' }
  );
  if (error) throw error;
};

export const clearPagePermission = async ({ orgId, scope, scopeValue, pageKey }) => {
  const { error } = await supabase
    .from('page_permissions')
    .delete()
    .eq('org_id', orgId)
    .eq('scope', scope)
    .eq('scope_value', scopeValue)
    .eq('page_key', pageKey);
  if (error) throw error;
};
// ── حركات الأسر (دخول/خروج/نقل) ─────────────────────────
export const fetchMovements = async (orgId, { type, campId } = {}) => {
  let q = supabase
    .from('family_movements')
    .select('*, families(head_name, head_id)')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(200);

  if (type) q = q.eq('type', type);
  if (campId) q = q.or(`from_camp.eq.${campId},to_camp.eq.${campId}`);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
};

export const createMovement = async (movementData) => {
  try {
    const { data, error } = await supabase.from('family_movements').insert([movementData]).select();
    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── جولات التوزيع (dist_rounds) ─────────────────────────
export const fetchDistRounds = async (orgId) => {
  const { data, error } = await supabase
    .from('dist_rounds')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createDistRound = async (roundData) => {
  try {
    const { data, error } = await supabase.from('dist_rounds').insert([roundData]).select();
    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/** تعديل بيانات الجولة (اسم/تاريخ/ملاحظات) -- لا تمس سجلات الاستلام إطلاقاً */
export const updateDistRound = async (roundId, updates) => {
  try {
    const { error } = await supabase.from('dist_rounds').update(updates).eq('id', roundId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * حذف جولة توزيع نهائياً — بما فيها **كل** سجلات الاستلام المرتبطة فيها
 * (camp_dist_families بـ round_id هذا)، وكأن الجولة لم تكن موجودة إطلاقاً.
 * الحذف من camp_dist_families أولاً إلزامي قبل حذف الجولة نفسها.
 */
export const deleteDistRound = async (roundId) => {
  try {
    const { error: delReceivedErr } = await supabase.from('camp_dist_families').delete().eq('round_id', roundId);
    if (delReceivedErr) throw delReceivedErr;

    const { error: delRoundErr } = await supabase.from('dist_rounds').delete().eq('id', roundId);
    if (delRoundErr) throw delRoundErr;

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/** عدد الأسر المستلمة لكل جولة توزيع بالمنظمة -- خريطة round_id → عدد،
 * لعرضها مباشرة على بطاقة كل جولة بقائمة التوزيعات. */
export const fetchDistReceivedCountsByRound = async (orgId) => {
  try {
    const { data, error } = await supabase.from('camp_dist_families').select('round_id').eq('org_id', orgId);
    if (error) throw error;
    const counts = {};
    (data || []).forEach((r) => {
      if (!r.round_id) return;
      counts[r.round_id] = (counts[r.round_id] || 0) + 1;
    });
    return counts;
  } catch (err) {
    console.error('[fetchDistReceivedCountsByRound]', err.message);
    return {};
  }
};

export const updateDistRoundStatus = async (roundId, status) => {
  try {
    const { error } = await supabase.from('dist_rounds').update({ status }).eq('id', roundId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── دفعات التوزيع لكل مخيم ضمن جولة (camp_distributions) ──
export const fetchLastDistributionDate = async (orgId) => {
  const { data, error } = await supabase
    .from('camp_dist_families')
    .select('received_at')
    .eq('org_id', orgId)
    .order('received_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.received_at || null;
};

// ── تسجيل استلام الأسر ضمن دفعة (camp_dist_families) ─────
// ── نسخة مرتبطة بالجولة مباشرة (round_id) -- بدون طبقة "دفعات" وسيطة ──
// نظام التوزيعات أُعيد تبسيطه: جولة = كيان واحد (اسم + تاريخ + ملاحظات)،
// لا يوجد أي مفهوم "دفعة" منفصل. الاستلام يُسجَّل مباشرة على الجولة.

export const fetchDistReceivedFamilyIdsByRound = async (roundId) => {
  const { data, error } = await supabase
    .from('camp_dist_families')
    .select('family_id')
    .eq('round_id', roundId);
  if (error) throw error;
  return new Set((data || []).map((r) => r.family_id));
};

export const markFamilyReceivedByRound = async (roundId, orgId, familyId, notes = null) => {
  const { error } = await supabase.from('camp_dist_families').insert([
    { round_id: roundId, family_id: familyId, org_id: orgId, received_at: new Date().toISOString(), notes },
  ]);
  if (error) throw error;
};

export const unmarkFamilyReceivedByRound = async (roundId, familyId) => {
  const { error } = await supabase
    .from('camp_dist_families')
    .delete()
    .eq('round_id', roundId)
    .eq('family_id', familyId);
  if (error) throw error;
};

export const createFamily = async (familyData) => {
  try {
    const { data, error } = await supabase
      .from('families')
      .insert([familyData])
      .select();

    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const updateFamily = async (familyId, updates) => {
  try {
    const { data, error } = await supabase
      .from('families')
      .update(updates)
      .eq('id', familyId)
      .select();

    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const deleteFamily = async (familyId) => {
  try {
    const { error } = await supabase
      .from('families')
      .delete()
      .eq('id', familyId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// أسرة واحدة كاملة (كل الأعمدة) — تُستخدم بشاشة التعديل
export const fetchFamilyById = async (familyId) => {
  const { data, error } = await supabase.from('families').select('*').eq('id', familyId).single();
  if (error) throw error;
  return data;
};

// حفظ أفراد الأسرة: نحذف كل الأفراد الحاليين ثم نُدرج القائمة الجديدة كاملة —
// أبسط وأضمن من مقارنة الفروقات (diff) لحجم بيانات هذا الفورم، وعملية غير متكررة.
export const saveFamilyMembers = async (familyId, members) => {
  const { error: delErr } = await supabase.from('family_members').delete().eq('family_id', familyId);
  if (delErr) throw delErr;

  if (!members || members.length === 0) return [];

  const rows = members.map((m) => ({
    family_id: familyId,
    name: m.name?.trim() || '',
    relation: m.relation || null,
    national_id: m.national_id?.trim() || null,
    dob: m.dob || null,
    gender: m.gender || null,
    health: m.health || null,
    orphan_status: m.orphan_status || null,
    orphan_cause: m.orphan_cause || null,
    disabilities: m.disabilities || [],
    injuries: m.injuries || [],
    chronic_diseases: m.chronic_diseases || [],
    female_status: m.female_status || [],
    needs: m.needs || [],
  }));

  const { data, error } = await supabase.from('family_members').insert(rows).select();
  if (error) throw error;
  return data;
};

export default supabase;

// ── نظام الموافقات (family_history) — منقول حرفياً من الأصل ──────
// كل الدوال تأخذ orgId صراحة (بدل ثابت عام ORG_ID بالأصل، لأن هذا
// المشروع يمرّر orgId من AuthContext بكل مكان بدل ثابت واحد).

export const recordApprovalRequest = async ({
  orgId, familyId, action, oldData, newData, changes, actorId, actorName, actorRole,
}) => {
  const { error } = await supabase.from('family_history').insert({
    org_id: orgId,
    family_id: familyId,
    action,
    changed_by: actorId || null,
    user_name: actorName || '—',
    user_role: actorRole || null,
    old_data: oldData || null,
    new_data: newData || null,
    changes: changes || null,
    status: 'pending',
  });
  if (error) throw error;
  if (action === 'delete' && familyId) {
    await supabase.from('families').update({ pending_delete: true }).eq('id', familyId);
  }
};

export const fetchPendingRequests = async (orgId) => {
  const { data, error } = await supabase
    .from('family_history')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const fetchDecisionLog = async (orgId, limit = 100) => {
  const { data, error } = await supabase
    .from('family_history')
    .select('*')
    .eq('org_id', orgId)
    .in('status', ['approved', 'rejected'])
    .order('reviewed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

export const approveRequest = async (req, reviewer) => {
  try {
    const { family_id, action, new_data, old_data } = req;

    if (action === 'delete') {
      await supabase.from('family_members').delete().eq('family_id', family_id);
      await supabase.from('families').delete().eq('id', family_id);
    } else if (action === 'camp_insert') {
      await supabase.from('camps').insert(new_data);
    } else if (action === 'camp_update') {
      await supabase.from('camps').update(new_data).eq('id', new_data.id);
    } else if (action === 'camp_delete') {
      await supabase.from('camps').delete().eq('id', old_data.id);
    } else if (action === 'user_insert') {
      await callAdminAPI('create_user', new_data);
    } else if (action === 'user_update') {
      await supabase.from('org_members').update(new_data).eq('id', new_data.id);
    } else if (action === 'user_delete') {
      await callAdminAPI('delete_user', { user_id: old_data.user_id, member_id: old_data.id });
    } else if (action?.startsWith('movement_')) {
      await supabase.from('family_movements').insert(new_data);
    } else {
      await supabase.from('families').update({ review_status: 'approved' }).eq('id', family_id);
    }

    await supabase
      .from('family_history')
      .update({
        status: 'approved',
        reviewed_by: reviewer?.user_id || reviewer?.id || null,
        reviewed_by_name: reviewer?.full_name || '—',
        reviewed_by_role: reviewer?.role || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.id);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

export const rejectRequest = async (req, reviewer, note) => {
  try {
    const { family_id, action, old_data } = req;

    if (action === 'insert') {
      await supabase.from('families').update({ review_status: 'rejected' }).eq('id', family_id);
    } else if (action === 'update' && old_data) {
      const restoreData = { ...old_data };
      delete restoreData.id;
      await supabase.from('families').update(restoreData).eq('id', family_id);
    } else if (action === 'delete') {
      await supabase.from('families').update({ pending_delete: false }).eq('id', family_id);
    }

    await supabase
      .from('family_history')
      .update({
        status: 'rejected',
        reviewed_by: reviewer?.user_id || reviewer?.id || null,
        reviewed_by_name: reviewer?.full_name || '—',
        reviewed_by_role: reviewer?.role || null,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      })
      .eq('id', req.id);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

/**
 * آخر التعديلات على الأسر (إضافة/تعديل/حذف) — من جدول family_activity_log
 * (موجود بالمخطط مسبقاً، RLS يحصر النتائج تلقائياً حسب المخيمات المسموحة
 * لهذا المستخدم، فلا حاجة لفلترة إضافية بالتطبيق).
 */
export const fetchFamilyActivityLog = async (orgId, limit = 15) => {
  try {
    const { data, error } = await supabase
      .from('family_activity_log')
      .select('id, family_id, family_name, members_count, action, actor_name, created_at, changes')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[fetchFamilyActivityLog]', err.message);
    return [];
  }
};

// ── الأسر الخارجة (Exited Families) ─────────────────────
// الأسرة لا تُحذف نهائياً أبداً -- عند "الخروج" تُنقل لقائمة منفصلة
// عبر exit_date/exit_reason (حقلان موجودان بالمخطط أصلاً)، وتختفي من
// كل الشاشات العادية (fetchFamilies تستبعدها تلقائياً).

export const fetchExitedFamilies = async (orgId) => {
  try {
    const { data, error } = await supabase
      .from('families')
      .select('id, org_id, camp_id, head_name, head_id, phone1, tent, exit_date, exit_reason, created_at')
      .eq('org_id', orgId)
      .eq('_deleted', false)
      .not('exit_date', 'is', null)
      .order('exit_date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[fetchExitedFamilies]', err.message);
    return [];
  }
};

/** تسجيل خروج أسرة -- تحديث فقط (exit_date + exit_reason)، بدون أي حذف.
 * تُسجَّل أيضاً كحركة "خروج" بجدول family_movements للأرشفة. */
export const exitFamily = async (family, { date, reason, notes, actorId, orgId }) => {
  try {
    const { error: updErr } = await supabase
      .from('families')
      .update({ exit_date: date, exit_reason: reason || null })
      .eq('id', family.id);
    if (updErr) throw updErr;

    await supabase.from('family_movements').insert([{
      family_id: family.id, org_id: orgId, type: 'exit',
      from_camp: family.camp_id || null, to_camp: null,
      date, reason: reason || null, notes: notes || null, created_by: actorId || null,
    }]);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/** إعادة قبول أسرة خارجة (تراجع عن الخروج) -- يمسح exit_date/exit_reason
 * فترجع تظهر بالقوائم العادية من جديد. */
export const reinstateExitedFamily = async (familyId) => {
  try {
    const { error } = await supabase.from('families').update({ exit_date: null, exit_reason: null }).eq('id', familyId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * نقل أسرة لمخيم آخر -- الطريقة الوحيدة لتغيير camp_id بعد الإضافة الأولى.
 * تحدّث كلاً من camp_id وentry_date على الأسرة نفسها (تاريخ النقل = دخول جديد)،
 * وتسجّل حركة "نقل" بجدول family_movements للأرشفة والتقارير.
 */
export const transferFamily = async (family, { toCampId, date, reason, notes, actorId, orgId }) => {
  try {
    const { error: updErr } = await supabase
      .from('families')
      .update({ camp_id: toCampId, entry_date: date })
      .eq('id', family.id);
    if (updErr) throw updErr;

    await supabase.from('family_movements').insert([{
      family_id: family.id, org_id: orgId, type: 'transfer',
      from_camp: family.camp_id || null, to_camp: toCampId,
      date, reason: reason || null, notes: notes || null, created_by: actorId || null,
    }]);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── عدادات خفيفة للشارات بالقائمة الجانبية (بدون جلب كل البيانات) ──

/** عدد الطلبات المعلّقة فقط (COUNT خفيف، بدون جلب أي صفوف فعلياً) */
export const fetchPendingRequestsCount = async (orgId) => {
  try {
    const { count, error } = await supabase
      .from('family_history')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'pending');
    if (error) throw error;
    return count || 0;
  } catch (err) {
    console.error('[fetchPendingRequestsCount]', err.message);
    return 0;
  }
};
