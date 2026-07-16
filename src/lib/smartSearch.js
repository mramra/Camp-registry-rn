/**
 * smartSearch.js — يحوّل جملة عربية حرة لفلتر فعلي على بيانات الأسر،
 * بقواعد ثابتة (كلمات مفتاحية + أنماط أرقام) بدون أي استدعاء API خارجي.
 * محدود بالأنماط المعرَّفة هنا فقط -- مو ذكاء اصطناعي حقيقي، لكن مجاني
 * وفوري وبدون اعتماد على اتصال إضافي بعد تحميل بيانات الأسر أصلاً.
 *
 * يرجع { filters, understood } — filters: كائن الفلتر الفعلي القابل
 * للتطبيق مباشرة على قائمة أسر، understood: وصف نصي لما فُهم من السؤال
 * (يُعرض للمستخدم للتأكد إن الفهم صحيح قبل الاعتماد على النتيجة).
 */

const AGE_WORDS = [
  { re: /رض[يّ]?ع/, min: 0, max: 2, label: 'رضّع (0-2 سنة)' },
  { re: /(أطفال|طفل)/, min: 0, max: 18, label: 'أطفال (أقل من 18)' },
  { re: /(شباب|شاب)/, min: 18, max: 35, label: 'شباب (18-35)' },
  { re: /(كبار السن|مسنين|مسن|عجائز|عجوز)/, min: 60, max: 200, label: 'كبار سن (60+)' },
];

const GENDER_WORDS = [
  { re: /(نساء|سيدات|امرأة|النساء)/, value: 'أنثى', label: 'نساء' },
  { re: /(رجال|ذكور|الرجال)/, value: 'ذكر', label: 'رجال' },
];

const HEALTH_WORDS = [
  { re: /(مرض مزمن|أمراض مزمنة|مرضى مزمن)/, key: 'chronic', label: 'مرضى بأمراض مزمنة' },
  { re: /(إعاقة|معاق|ذوي إعاقة|معاقين)/, key: 'disability', label: 'ذوي إعاقة' },
  { re: /(مصاب|إصاب)/, key: 'injury', label: 'مصابين' },
  { re: /(يتيم|أيتام)/, key: 'orphan', label: 'أيتام' },
];

const CATEGORY_WORDS = [
  { re: /(شهيد|شهداء)/, key: 'martyr', label: 'أسر شهداء' },
  { re: /(أسير|أسرى)/, key: 'captive', label: 'أسر أسرى' },
  { re: /(فاقد.*معيل|بدون معيل|بلا معيل)/, key: 'no_provider', label: 'فاقدة معيل' },
  { re: /(أسرة كبيرة|أسر كبيرة|عائلة كبيرة)/, key: 'large', label: 'أسر كبيرة' },
];

const QUALITY_WORDS = [
  { re: /(ناقص|نواقص)/, key: 'incomplete', label: 'بيانات ناقصة' },
  { re: /(بدون جوال|بلا هاتف|بدون رقم)/, key: 'no_phone', label: 'بدون جوال' },
  { re: /(هوية مكررة|مكرر)/, key: 'dup', label: 'هوية/جوال مكرر' },
];

const VULN_WORDS = /(شديد.*ضعف|الأشد ضعفاً|ضعيفة|أشد احتياجاً|الأكثر احتياجاً)/;

/** يحاول يلقط عمر رقمي صريح: "فوق 50"، "أكبر من 60"، "أقل من 10"، "بين 20 و30" */
function extractExplicitAge(text) {
  const between = text.match(/بين\s*(\d+)\s*(?:و|الى|إلى|-)\s*(\d+)/);
  if (between) return { min: Number(between[1]), max: Number(between[2]) };

  const above = text.match(/(?:فوق|أكبر من|اكبر من|أكثر من|اكثر من)\s*(\d+)/);
  if (above) return { min: Number(above[1]), max: 200 };

  const below = text.match(/(?:تحت|أقل من|اقل من|دون)\s*(\d+)/);
  if (below) return { min: 0, max: Number(below[1]) };

  return null;
}

export function parseSmartQuery(text, camps = []) {
  const q = (text || '').trim();
  const filters = {};
  const understood = [];

  if (!q) return { filters, understood };

  // العمر: صريح رقمياً أولاً (أدق)، وإلا كلمة عمرية عامة
  const explicitAge = extractExplicitAge(q);
  if (explicitAge) {
    filters.ageMin = explicitAge.min;
    filters.ageMax = explicitAge.max;
    understood.push(`العمر بين ${explicitAge.min} و${explicitAge.max}`);
  } else {
    const ageWord = AGE_WORDS.find((w) => w.re.test(q));
    if (ageWord) {
      filters.ageMin = ageWord.min;
      filters.ageMax = ageWord.max;
      understood.push(ageWord.label);
    }
  }

  const genderWord = GENDER_WORDS.find((w) => w.re.test(q));
  if (genderWord) {
    filters.gender = genderWord.value;
    understood.push(genderWord.label);
  }

  const healthWord = HEALTH_WORDS.find((w) => w.re.test(q));
  if (healthWord) {
    filters.health = healthWord.key;
    understood.push(healthWord.label);
  }

  const categoryWord = CATEGORY_WORDS.find((w) => w.re.test(q));
  if (categoryWord) {
    filters.category = categoryWord.key;
    understood.push(categoryWord.label);
  }

  const qualityWord = QUALITY_WORDS.find((w) => w.re.test(q));
  if (qualityWord) {
    filters.quality = qualityWord.key;
    understood.push(qualityWord.label);
  }

  if (VULN_WORDS.test(q)) {
    filters.vulnerable = true;
    understood.push('شديدة الضعف');
  }

  // اسم مخيم -- مطابقة مباشرة لأي اسم مخيم فعلي مذكور بالنص
  const campMatch = camps.find((c) => c.name && q.includes(c.name));
  if (campMatch) {
    filters.campId = campMatch.id;
    understood.push(`مخيم ${campMatch.name}`);
  }

  return { filters, understood };
}
