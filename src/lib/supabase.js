import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ojclpkenecicujkqhhlu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});

// =========== Helper Functions ===========

export const fetchFamilies = async (orgId, campId = null) => {
  try {
    let q = supabase
      .from('families')
      .select('id, org_id, camp_id, head_name, head_id, phone1, phone2, category_tags, economic_level, review_status, pending_delete, created_at')
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
      .select('id, family_id, name, relation, national_id, dob, gender')
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
      .select('id, name, status, address, capacity')
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

export default supabase;
