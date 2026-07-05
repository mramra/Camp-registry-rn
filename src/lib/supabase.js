import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ojclpkenecicujkqhhlu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
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
      .select('id, org_id, camp_id, head_name, head_id, head_gender, head_dob, head_marital, phone1, phone2, category_tags, economic_level, review_status, pending_delete, created_at, tent, head_female_status, head_chronic_diseases, head_disabilities, head_injuries')
      .eq('org_id', orgId)
      .eq('_deleted', false)
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
        'orphan_status, orphan_cause, disabilities, injuries, chronic_diseases, female_status'
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
      'can_review_approvals, is_active, created_at'
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
export const fetchDistBatches = async (roundId) => {
  const { data, error } = await supabase
    .from('camp_distributions')
    .select('*')
    .eq('round_id', roundId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createDistBatch = async (batchData) => {
  try {
    const { data, error } = await supabase.from('camp_distributions').insert([batchData]).select();
    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── تسجيل استلام الأسر ضمن دفعة (camp_dist_families) ─────
export const fetchDistReceivedFamilyIds = async (distributionId) => {
  const { data, error } = await supabase
    .from('camp_dist_families')
    .select('family_id')
    .eq('distribution_id', distributionId);
  if (error) throw error;
  return new Set((data || []).map((r) => r.family_id));
};

export const markFamilyReceived = async (distributionId, orgId, familyId, notes = null) => {
  const { error } = await supabase.from('camp_dist_families').insert([
    { distribution_id: distributionId, family_id: familyId, org_id: orgId, received_at: new Date().toISOString(), notes },
  ]);
  if (error) throw error;
};

export const unmarkFamilyReceived = async (distributionId, familyId) => {
  const { error } = await supabase
    .from('camp_dist_families')
    .delete()
    .eq('distribution_id', distributionId)
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
  }));

  const { data, error } = await supabase.from('family_members').insert(rows).select();
  if (error) throw error;
  return data;
};

export default supabase;
