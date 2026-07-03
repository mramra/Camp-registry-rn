// helpers.js — منطق الأسر المشترك (منقول من camp-registry-react/src/lib/helpers.js)
// نفس المنطق تماماً — لا يعتمد على DOM، فقابل للنقل حرفياً بين الويب والموبايل.

export function calcAge(dob) {
  if (!dob) return null;
  const b = new Date(dob);
  if (isNaN(b)) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

function parseArr(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    let parsed = JSON.parse(v);
    // بعض القيم مخزّنة بترميز مزدوج (JSON داخل JSON) — كما شوهد فعلياً بالبيانات الحية
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isNoProviderFamily(family, members) {
  const headIsFemale = family?.head_gender === 'أنثى' || family?.head_gender === 'female';
  if (!headIsFemale) return false;
  const hasAdultMale = (members || []).some((m) => {
    if (!['زوج', 'ابن'].includes((m.relation || '').trim())) return false;
    const age = calcAge(m.dob);
    return age === null || age >= 18;
  });
  return !hasAdultMale;
}

export function getFamilyCategories(family, members) {
  const stored = parseArr(family?.category_tags);
  const auto = [];
  const mems = members || [];

  if (isNoProviderFamily(family, mems)) auto.push('no_provider');
  if (1 + mems.length > 7) auto.push('large');

  const all = [...stored, ...auto];
  return all.length ? all : ['normal'];
}

export function getFamilyPriority(family, members) {
  const cats = getFamilyCategories(family, members);
  let score = 0;
  if (cats.includes('martyr')) score += 3;
  if (cats.includes('captive')) score += 3;
  if (cats.includes('no_provider')) score += 2;
  if (family?.economic_level === 'extreme_poverty') score += 2;
  if (cats.includes('large')) score += 1;
  const tier = score >= 3 ? 'urgent' : score >= 1 ? 'need' : 'ok';
  return { score, tier };
}

export function getOrphanCount(family, members) {
  return isNoProviderFamily(family, members) ? (members || []).length : 0;
}

export const CATEGORY_LABELS = {
  martyr: '🕊️ شهيد',
  captive: '⛓️ أسير',
  no_provider: '⚠️ فاقد معيل',
  large: '👨‍👩‍👧‍👦 أسرة كبيرة',
  normal: '📋 عادية',
};

export const TIER_LABELS = {
  urgent: 'عاجل',
  need: 'يحتاج',
  ok: 'عادي',
};
