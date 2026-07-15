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
    const a = calcAge(m.dob);
    if (a !== null && a < 2) s.add(m.family_id);
  });
  (families || []).forEach((f) => {
    const a = calcAge(f.head_dob);
    if (a !== null && a < 2) s.add(f.id);
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
