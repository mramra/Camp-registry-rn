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

// ════════════════════════════════════════════════════════════
// دوال التحقق من صحة البيانات (منقولة حرفياً من helpers.js الأصلي)
// ════════════════════════════════════════════════════════════

export function isAgeInRange(dob, min, max) {
  if (!dob) return false;
  const b = new Date(dob);
  if (isNaN(b)) return false;
  const ms = Date.now() - b.getTime();
  if (ms < 0) return false;
  const years = ms / (365.25 * 24 * 3600 * 1000);
  if (min !== '' && min !== null && min !== undefined && years < parseFloat(min)) return false;
  if (max !== '' && max !== null && max !== undefined && years > parseFloat(max)) return false;
  return true;
}

/** يرجع قائمة نصية بكل النواقص في بيانات أسرة معيّنة (فاضية = بيانات كاملة) */
export function checkFamilyIssues(f, members) {
  const issues = [];
  const mems = members || [];

  if (!f.head_name?.trim()) issues.push('اسم رب الأسرة ناقص');
  else if ((f.head_name || '').trim().split(/\s+/).filter(Boolean).length < 4)
    issues.push('الاسم غير رباعي');

  if (!f.head_id?.trim()) issues.push('رقم الهوية ناقص');
  if (!f.phone1?.trim()) issues.push('رقم الجوال ناقص');
  if (!f.camp_id) issues.push('المخيم غير محدد');
  if (!f.head_dob) issues.push('تاريخ الميلاد ناقص');
  if (!f.head_marital?.trim()) issues.push('الحالة الاجتماعية ناقصة');

  const marital = (f.head_marital || '').trim();
  if (marital === 'متزوج' || marital === 'متزوجة') {
    const hasSpouse = mems.some((m) => m.relation === 'زوجة' || m.relation === 'زوج');
    if (!hasSpouse) issues.push('بيانات الزوجة ناقصة');
  }

  mems.forEach((m) => {
    const name = (m.name || '').trim();
    if (!name) {
      issues.push('اسم فرد فارغ');
      return;
    }
    if (name.split(/\s+/).filter(Boolean).length < 3) issues.push(`اسم "${name}" قصير جداً`);
  });

  return issues;
}

/** هل بيانات هذه الأسرة ناقصة (أي نقص واحد على الأقل)؟ */
export function isIncomplete(f, members) {
  return checkFamilyIssues(f, members).length > 0;
}

/** خوارزمية Luhn — للتحقق من صحة رقم الهوية رياضياً */
export function luhnCheck(num) {
  const n = String(num).replace(/\D/g, '');
  if (!n) return false;
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = parseInt(n[n.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** تحقق الاسم الرباعي — يرجع رسالة خطأ أو null لو صحيح */
export function validateName(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return `❌ الاسم يجب أن يكون رباعياً (${words.length}/4 كلمات)`;
  return null;
}

/** تحقق تاريخ الميلاد (يمنع أي تاريخ مستقبلي) */
export function validateDob(dob) {
  if (!dob) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(dob) > today) return '❌ تاريخ الميلاد لا يمكن أن يكون في المستقبل';
  return null;
}

/** أفراد أسرة معيّنة، باستبعاد رب الأسرة نفسه */
export function getMembers(allMems, family) {
  return allMems.filter((m) => {
    if (m.family_id !== family.id) return false;
    const rel = (m.relation || '').trim();
    const mName = (m.name || '').trim().replace(/\s+/g, ' ');
    const hName = (family.head_name || '').trim().replace(/\s+/g, ' ');
    if (['رب الأسرة', 'رب أسرة', 'head'].includes(rel)) return false;
    if (family.head_id && m.national_id && m.national_id.trim() === family.head_id.trim()) return false;
    if (mName && hName && mName === hName) return false;
    return true;
  });
}

/** أيقونة تمثيلية للفرد حسب صلته بالأسرة وجنسه */
export function getMemberIcon(relation, gender) {
  const rel = (relation || '').trim();
  const g = (gender || '').trim();
  const isFemale = g === 'أنثى' || g === 'female';
  const isMale = g === 'ذكر' || g === 'male';
  if (rel === 'زوجة' || rel === 'زوج') return '💑';
  if (rel === 'ابن' || rel === 'ولد') return '👦';
  if (rel === 'ابنة' || rel === 'بنت') return '👧';
  if (rel === 'أب' || rel === 'أم') return isFemale ? '👩' : '👨';
  if (rel === 'أخ' || rel === 'أخت') return isFemale ? '👩' : '👦';
  if (rel === 'جد' || rel === 'جدة') return isFemale ? '👵' : '👴';
  if (isFemale) return '👩';
  if (isMale) return '👨';
  return '👤';
}

/**
 * مقارنة نصوص "طبيعية" (تُبقي الأرقام بترتيبها الرقمي الصحيح: 2 قبل 10)
 * بدون أي استخدام لـ localeCompare/Intl — عمداً، لأن Hermes على أندرويد
 * له خطأ موثّق (facebook/hermes#867): استدعاءات نادرة لكن بطيئة جداً
 * (حتى 8+ ثوانٍ للمقارنة الواحدة) عند استخدام localeCompare بمعامل لغة،
 * ما يسبب تجمّد التطبيق فعلياً عند فرز قوائم بها مئات العناصر.
 */
export function naturalCompare(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  const re = /(\d+)|(\D+)/g;
  const partsA = sa.match(re) || [];
  const partsB = sb.match(re) || [];
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const pa = partsA[i] || '';
    const pb = partsB[i] || '';
    const na = Number(pa);
    const nb = Number(pb);
    const bothNumeric = pa !== '' && pb !== '' && !isNaN(na) && !isNaN(nb);

    if (bothNumeric) {
      if (na !== nb) return na - nb;
    } else if (pa !== pb) {
      return pa < pb ? -1 : 1;
    }
  }
  return 0;
}
