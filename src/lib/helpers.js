// helpers.js — منطق الأسر المشترك (منقول من camp-registry-react/src/lib/helpers.js)
// نفس المنطق تماماً — لا يعتمد على DOM، فقابل للنقل حرفياً بين الويب والموبايل.

import { TRACKED_FIELDS } from './formOptions';

/** هل هذا المستخدم معفى من نظام موافقة platform_owner (تنفيذ فوري بدون
 * مراجعة)؟ -- منقولة حرفياً من الويب (camp-registry-react/src/lib/db.js). */
export function isExemptFromApproval(profile) {
  if (!profile) return false;
  return profile.role === 'platform_owner' || profile.bypass_approval === true;
}

/** يحسب الفروقات بين نسخة قديمة وجديدة من بيانات الأسرة، بس للحقول
 * المتتبَّعة بـTRACKED_FIELDS -- تُستخدم لعرض "قبل/بعد" بشاشتي الطلبات
 * المعلقة وسجل النشاط. valueResolvers اختياري لتحويل قيمة خام (مثل
 * camp_id) لاسم مقروء بدل المعرّف الخام. */
export function diffFamilyFields(oldData, newData, valueResolvers = {}) {
  const changes = {};
  for (const field of Object.keys(TRACKED_FIELDS)) {
    const oldRaw = oldData?.[field] ?? null;
    const newRaw = newData?.[field] ?? null;
    const oldStr = oldRaw === null || oldRaw === '' ? null : String(oldRaw);
    const newStr = newRaw === null || newRaw === '' ? null : String(newRaw);
    if (oldStr !== newStr) {
      const resolve = valueResolvers[field];
      changes[field] = {
        old: resolve && oldStr ? resolve(oldStr) : oldStr,
        new: resolve && newStr ? resolve(newStr) : newStr,
      };
    }
  }
  return changes;
}

export function calcAge(dob) {
  if (!dob) return null;
  const b = new Date(dob);
  if (isNaN(b)) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

/**
 * أقصى عمر (بالسنوات الكاملة) يُعتبر فيه الشخص "رضيع" -- مصدر الحقيقة
 * الوحيد لهذا الرقم بكامل التطبيق. القاعدة المتّفق عليها: "رضيع = أقل
 * من سنتين" (0 و1 سنة فقط، مو سنتين كاملتين) = عمر أقصى 1 سنة كاملة.
 * أي مكان بالكود يحتاج يعرف "هل هذا الشخص رضيع؟" لازم يستدعي isInfantAge()
 * بدل ما يكتب شرط (age < 2) خام بنفسه -- هيك أي تعديل مستقبلي على تعريف
 * الرضيع (تغيير السن مثلاً) يصير بمكان واحد بس، وما يصير فرق بصمت بين
 * شاشة وشاشة زي ما حصل قبل هذا التوحيد.
 */
export const INFANT_MAX_AGE = 1;

/** هل هذا العمر (بالسنوات) يقع ضمن تعريف "رضيع" (أقل من سنتين)؟ */
export function isInfantAge(age) {
  return age !== null && age !== undefined && age <= INFANT_MAX_AGE;
}

export function parseArr(v) {
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

/** هل يوجد قيمة فعلية بهذا الحقل (مصفوفة حالات صحية)؟ */
export function hasHealthData(val) {
  return parseArr(val).length > 0;
}

/** نص العرض المُجمَّع للمصفوفة (يدعم عناصر نصية أو كائنات بها type/detail) */
export function arrLabel(val) {
  const arr = parseArr(val);
  if (!arr.length) return '';
  return arr
    .map((v) => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') return [v.type, v.label, v.detail].filter(Boolean).join(' - ');
      return String(v);
    })
    .filter(Boolean)
    .join('، ');
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
  if (cats.includes('large')) score += 1;
  const tier = score >= 3 ? 'urgent' : score >= 1 ? 'need' : 'ok';
  return { score, tier };
}

/**
 * درجة الضعف — مقياس رقمي تراكمي منفصل عن getFamilyPriority (يعتمد
 * فئات ثابتة كشهيد/أسير). هذا يحسب من بيانات فعلية بكل أسرة: حجم
 * الأسرة، الإعاقات، كبار السن (60+)، الأمراض المزمنة، الأيتام،
 * وفقدان المعيل -- عشان ترتيب أولوية توزيعات دقيق حتى بدون فئات مسجَّلة.
 */
export function getVulnerabilityScore(family, members) {
  const mems = members || [];
  const totalCount = mems.length + 1;

  const healthCount = (raw) => {
    const n = normalizeHealthValue(raw);
    return n ? n.split('، ').filter(Boolean).length : 0;
  };

  const ages = [calcAge(family?.head_dob), ...mems.map((m) => calcAge(m.dob))];
  const elderlyCount = ages.filter((a) => a !== null && a >= 60).length;
  const disabilityCount = healthCount(family?.head_disabilities) + mems.reduce((s, m) => s + healthCount(m.disabilities), 0);
  const chronicCount = healthCount(family?.head_chronic_diseases) + mems.reduce((s, m) => s + healthCount(m.chronic_diseases), 0);
  const orphanCount = mems.filter((m) => m.orphan_status).length;
  const noProvider = isNoProviderFamily(family, mems);

  let score = 0;
  score += Math.max(0, totalCount - 5); // فرد إضافي فوق 5 = نقطة
  score += disabilityCount * 2;
  score += elderlyCount;
  score += chronicCount;
  score += orphanCount;
  if (noProvider) score += 3;

  const tier = score >= 8 ? 'critical' : score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';
  return { score, tier, totalCount, disabilityCount, elderlyCount, chronicCount, orphanCount, noProvider };
}

export const VULNERABILITY_TIER_LABELS = {
  critical: '🔴 حرجة',
  high: '🟠 عالية',
  medium: '🟡 متوسطة',
  low: '🟢 منخفضة',
};

/** ترتيب مستويات درجة الضعف الأربعة -- كان مكرَّراً حرفياً بشاشتي
 * NeedsReportScreen وDistributionReceiveScreen. */
export const VULNERABILITY_TIER_KEYS = ['critical', 'high', 'medium', 'low'];

/** الحقول الأساسية المطلوبة لاعتبار سجل الأسرة "مكتمل الحد الأدنى" --
 * كانت مكرَّرة حرفياً بشاشتي CampCompareScreen وAnalysisScreen. */
export const REQUIRED_FAMILY_FIELDS = ['head_name', 'head_id', 'phone1', 'camp_id'];

/** خريطة حقول الحالة الصحية (رب الأسرة + الأفراد) لكل نوع -- كانت مكرَّرة
 * بشكلين مختلفين قليلاً بشاشتي HealthRecordsScreen وNeedsReportScreen. */
export const HEALTH_FIELD_MAP = {
  chronic: { fField: 'head_chronic_diseases', mField: 'chronic_diseases', label: 'أمراض مزمنة' },
  disability: { fField: 'head_disabilities', mField: 'disabilities', label: 'إعاقة' },
  injury: { fField: 'head_injuries', mField: 'injuries', label: 'إصابة' },
  needs: { fField: 'head_needs', mField: 'needs', label: 'احتياج صحي' },
};

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
/** هل ينقص تاريخ ميلاد رب الأسرة أو أي فرد بالأسرة؟ -- checkFamilyIssues
 * تفحص رب الأسرة بس؛ هذي تفحص الأفراد كمان (اكتُشفت الحاجة أثناء تدقيق
 * كشف BLDA لمخيم السلام الأولمبي). */
export function hasMissingDob(family, members) {
  if (!family?.head_dob) return true;
  return (members || []).some((m) => !m.dob);
}

export function checkFamilyIssues(f, members) {
  const issues = [];
  const mems = members || [];

  if (!f.head_name?.trim()) issues.push('اسم رب الأسرة ناقص');
  else if ((f.head_name || '').trim().split(/\s+/).filter(Boolean).length < 4)
    issues.push('الاسم غير رباعي');

  if (!f.head_id?.trim()) issues.push('رقم الهوية ناقص');
  if (!f.phone1?.trim()) issues.push('رقم الجوال ناقص');
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

// ════════════════════════════════════════════════════════════
// المرحلة الدراسية المتوقعة حسب العمر (نظام التعليم الفلسطيني)
// منقول حرفياً من camp-registry-react/src/lib/helpers.js
// ════════════════════════════════════════════════════════════

const GRADE_BY_AGE = {
  4: 'روضة أولى', 5: 'روضة ثانية',
  6: 'أول ابتدائي', 7: 'ثاني ابتدائي', 8: 'ثالث ابتدائي', 9: 'رابع ابتدائي', 10: 'خامس ابتدائي', 11: 'سادس ابتدائي',
  12: 'أول اعدادي', 13: 'ثاني اعدادي', 14: 'ثالث اعدادي',
  15: 'أول ثانوي', 16: 'ثاني ثانوي', 17: 'توجيهي',
};

/** المرحلة الدراسية المتوقعة لهذا العمر — null لو خارج نطاق سن الدراسة (أقل من 4) */
export function getExpectedGrade(age) {
  if (age == null) return null;
  if (age > 17) return 'بعد الثانوية';
  return GRADE_BY_AGE[age] || null;
}

/** هل هذا العمر بعمر الدراسة (روضة حتى توجيهي)؟ */
export function isSchoolAge(age) {
  return age != null && age >= 4 && age <= 17;
}

/** كل الصفوف الدراسية مرتَّبة (روضة أولى ← توجيهي) — لقائمة اختيار الصف الفعلي */
export const GRADE_OPTIONS = [
  'روضة أولى', 'روضة ثانية',
  'أول ابتدائي', 'ثاني ابتدائي', 'ثالث ابتدائي', 'رابع ابتدائي', 'خامس ابتدائي', 'سادس ابتدائي',
  'أول اعدادي', 'ثاني اعدادي', 'ثالث اعدادي',
  'أول ثانوي', 'ثاني ثانوي', 'توجيهي',
];

/**
 * مقدار التأخر الدراسي بالصفوف: الفرق بين الصف المتوقَّع لعمره الآن والصف الفعلي
 * المُسجَّل له. 0 يعني غير متأخر (أو لا صف فعلي مسجَّل — يُعتبر مطابقاً للمتوقع).
 */
export function getGradeDelay(age, actualGrade) {
  if (!actualGrade) return 0;
  const expected = getExpectedGrade(age);
  if (!expected) return 0;
  const expIdx = GRADE_OPTIONS.indexOf(expected);
  const actIdx = GRADE_OPTIONS.indexOf(actualGrade);
  if (expIdx === -1 || actIdx === -1) return 0;
  return Math.max(0, expIdx - actIdx);
}

/** فئة المرحلة الواسعة لهذا العمر — لعرض الأيقونات (روضة/ابتدائي/اعدادي/ثانوي) */
export function getStageGroup(age) {
  if (age == null) return null;
  if (age >= 4 && age <= 5) return 'روضة';
  if (age >= 6 && age <= 11) return 'ابتدائي';
  if (age >= 12 && age <= 14) return 'اعدادي';
  if (age >= 15 && age <= 17) return 'ثانوي';
  return null;
}

/** الأيقونات الثماني الكاملة (مراحل الأطفال + مؤهلات البالغين) بترتيب العرض */
export const STAGE_ICONS = [
  { key: 'روضة', icon: '🧸', label: 'روضة' },
  { key: 'ابتدائي', icon: '✏️', label: 'ابتدائي' },
  { key: 'اعدادي', icon: '📘', label: 'اعدادي' },
  { key: 'ثانوي', icon: '📙', label: 'ثانوي' },
  { key: 'دبلوم', icon: '📜', label: 'دبلوم' },
  { key: 'بكالوريوس', icon: '🎓', label: 'بكالوريوس' },
  { key: 'ماجستير', icon: '📚', label: 'ماجستير' },
  { key: 'دكتوراه', icon: '👨‍🎓', label: 'دكتوراه' },
];

/** صلات تُعتبر "زوجة/أم" لحساب المرضعة تلقائياً */
export const VALID_MOTHER_RELATIONS = ['زوجة', 'زوجة ثانية', 'زوجة ثالثة', 'زوجة رابعة', 'زوجه', 'أم', 'wife', 'mother'];

/** الأسر التي فيها زوجة/أم مسجّلة بصلة محددة (Set من family_id) */
export function buildFamHasNamedWife(members) {
  const s = new Set();
  (members || []).forEach((m) => {
    const rel = (m.relation || '').trim();
    if (VALID_MOTHER_RELATIONS.includes(rel)) s.add(m.family_id);
  });
  return s;
}

/** الأسر التي فيها رضيع (عمر أقل من سنتين) من الأفراد أو رب الأسرة (Set من family_id) */
export function buildFamWithInfant(members, families) {
  const s = new Set();
  (members || []).forEach((m) => {
    if (isInfantAge(calcAge(m.dob))) s.add(m.family_id);
  });
  (families || []).forEach((f) => {
    if (isInfantAge(calcAge(f.head_dob))) s.add(f.id);
  });
  return s;
}

/**
 * هل هذا الشخص مرضعة تلقائياً (بدون تسجيل صريح بحقل female_status)؟
 * عمر 15-50 + صلة زوجة/أم (أو امرأة بلا صلة مسجّلة في أسرة بلا زوجة معروفة) + وجود رضيع بالأسرة.
 */
export function isAutoNursing(person, famHasNamedWife, famWithInfant) {
  const relation = (person.relation || '').trim();
  const age = person.age;
  const famId = person.family_id;
  const inAgeRange = age === null || (age >= 15 && age <= 50);
  let relationOk = false;
  if (relation) {
    relationOk = VALID_MOTHER_RELATIONS.includes(relation);
  } else if (!person.isHead) {
    relationOk = !famHasNamedWife.has(famId);
  } else {
    relationOk = true;
  }
  return inAgeRange && relationOk && famWithInfant.has(famId);
}

/** خيارات المؤهل العلمي للبالغين (18+) — حقل اختياري، فاضي يعني غير مُسجَّل */
export const QUALIFICATION_OPTIONS = ['دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه'];

/**
 * مندوب المخيم (بالاسم/الجوال) — مفاضلة ثلاثية:
 * 1. عضو منظمة دوره camp_delegate ومربوط بنفس المخيم
 * 2. الشخص المُعرَّف manager_id بالمخيم
 * 3. أي عضو آخر مرتبط بهذا المخيم — احتياط أخير
 */
export function getCampDelegateInfo(camp, orgMembers) {
  if (!camp) return null;
  let person = (orgMembers || []).find((m) => m.camp_id === camp.id && m.role === 'camp_delegate');
  if (!person) person = (orgMembers || []).find((m) => m.id === camp.manager_id);
  if (!person) person = (orgMembers || []).find((m) => m.camp_id === camp.id);
  return {
    name: person?.full_name || '',
    phone: person?.phone || person?.national_id || '',
  };
}

/**
 * الدالة المركزية الوحيدة لبناء بانر ملفات Excel بكل شاشات التصدير --
 * تُستخدم بدل أي نسخة محلية مكتوبة يدوياً بكل شاشة لحالها (كانت السبب
 * الحقيقي لبق "ناقص إحداثيات المخيم" اللي ظهر بسجل الحالات الصحية: نسخ
 * مبسّطة نُسيت منها الإحداثيات لما اتكتبت لاحقاً بشاشات مختلفة).
 * السطر الأول: اسم المخيم (خط كبير). السطر الثاني: المندوب + جواله + الإحداثيات.
 * ترجع null لو ما فيه مخيم (يعني بلا بانر إطلاقاً -- الاستدعاء يتحقق بنفسه).
 */
export function buildCampExportBanner(camp, orgMembers) {
  if (!camp) return null;
  const delegate = getCampDelegateInfo(camp, orgMembers);
  const rawName = camp.name || '—';
  const displayName = rawName.trim().startsWith('مخيم') ? rawName : `مخيم ${rawName}`;
  const coords = camp.latitude && camp.longitude ? `${camp.latitude}, ${camp.longitude}` : 'بلا إحداثيات';
  const infoLine = [
    `👤 المندوب: ${delegate?.name || 'غير معيَّن'}`,
    `📱 ${delegate?.phone || '—'}`,
    `📍 ${coords}`,
  ].join('   ');
  return [
    { text: `🏕️ ${displayName}`, size: 18 },
    { text: infoLine, size: 11 },
  ];
}

/**
 * بانر التصدير النهائي حسب دور المستخدم المصدِّر (وليس فقط حسب المخيم
 * المفلتَر بالبيانات) -- طلب صريح:
 * - المندوب/المساعد: بانر شخصي دائم باسمه هو، يظهر بكل تصدير يسويه بغض
 *   النظر لو اختار مخيمه بالفلتر أو "كل المخيمات" (أصلاً محصور بمخيمه
 *   وحده، فـ"كل المخيمات" بالنسبة له هو نفسه مخيمه).
 * - مالك المنصة/مدير الإيواء: بانر المخيم اللي يختاره صراحة (bannerCamp)
 *   من قائمة مخيماته المرئية -- منفصل تماماً عن فلتر عرض البيانات، فيقدر
 *   يصدّر "كل المخيمات" ويحدد بانر مخيم معيّن لو حاب، أو يلغي البانر.
 */
export function getExportBannerLines(profile, bannerCamp, orgMembers) {
  if (!profile) return null;

  if (profile.role === 'camp_delegate' || profile.role === 'assistant') {
    const roleLabel = profile.role === 'camp_delegate' ? 'المندوب' : 'المساعد';
    const rawName = bannerCamp?.name;
    const displayName = rawName ? (rawName.trim().startsWith('مخيم') ? rawName : `مخيم ${rawName}`) : null;
    const coords = bannerCamp?.latitude && bannerCamp?.longitude ? `${bannerCamp.latitude}, ${bannerCamp.longitude}` : null;
    const infoLine = [
      `👤 ${roleLabel}: ${profile.full_name || '—'}`,
      `📱 ${profile.phone || '—'}`,
      coords ? `📍 ${coords}` : null,
    ].filter(Boolean).join('   ');
    return [
      { text: displayName ? `🏕️ ${displayName}` : '🏕️ كشف بيانات', size: 18 },
      { text: infoLine, size: 11 },
    ];
  }

  // مالك المنصة / مدير الإيواء -- بانر المخيم المختار صراحة فقط، وإلا بلا بانر
  return buildCampExportBanner(bannerCamp, orgMembers);
}

/**
 * قيم الحالات الصحية تختلف شكلها فعلياً حسب الجدول (تأكدنا من db.js الأصلي):
 * - family_members.disabilities/injuries/chronic_diseases: مصفوفة Postgres حقيقية
 *   (JS array فعلي عبر REST مباشرة)
 * - families.head_disabilities/... : نص JSON (قد يصل كسلسلة نصية، أو أحياناً
 *   يُفكّكه PostgREST تلقائياً حسب نوع العمود الفعلي بقاعدة البيانات)
 * هذه الدالة تتعامل مع الحالتين بأمان بدل افتراض إنه نص دايماً (كان هذا
 * بالضبط سبب خطأ 'trim is not a function' — القيمة كانت مصفوفة فعلية).
 */
export function normalizeHealthValue(raw, depth = 0) {
  if (!raw || depth > 3) return '';
  if (Array.isArray(raw)) {
    // كل عنصر إما نص جاهز، أو كائن {type, detail} (شكل حقيقي بجدول family_members)
    const parts = raw
      .filter(Boolean)
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const type = item.type || '';
          const detail = item.detail ? ` (${item.detail})` : '';
          return type ? `${type}${detail}` : '';
        }
        return '';
      })
      .filter(Boolean);
    return parts.join('، ');
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '[]' || trimmed === '""' || trimmed === 'null') return '';
    try {
      const parsed = JSON.parse(trimmed);
      // ترميز مزدوج محتمل (نص JSON داخل نص JSON) — نطبّع بشكل متكرر بحد أقصى
      if (Array.isArray(parsed) || typeof parsed === 'string') {
        return normalizeHealthValue(parsed, depth + 1);
      }
    } catch {
      // ليست JSON — نص عادي فعلي، نُرجعه كما هو
    }
    return trimmed;
  }
  return String(raw);
}
