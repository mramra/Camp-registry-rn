// formOptions.js — منقول حرفياً من src/pages/Families/FamilyForm.jsx (camp-registry-react)
// نفس المفاتيح والتسميات بالضبط لضمان توافق البيانات مع النسخة الويب.

export const RELATION_BY_GENDER = {
  'ذكر': ['زوج', 'ابن', 'أب', 'أخ', 'جد', 'حفيد', 'عم', 'خال', 'أخرى'],
  'أنثى': ['زوجة', 'ابنة', 'أم', 'أخت', 'جدة', 'حفيدة', 'عمة', 'خالة', 'أخرى'],
};

export const ALL_RELATIONS = [
  ...new Set([...RELATION_BY_GENDER['ذكر'], ...RELATION_BY_GENDER['أنثى']]),
];

export const HEALTH_OPTIONS = [
  { v: 'سليم', label: '✅ سليم' },
  { v: 'مريض', label: '🤒 مريض' },
  { v: 'معاق', label: '♿ معاق' },
  { v: 'مزمن', label: '💊 مرض مزمن' },
  { v: 'مصاب', label: '🩹 إصابة حرب' },
];

export const MARITAL_BY_GENDER = {
  'ذكر': ['متزوج', 'أعزب', 'مطلق', 'أرمل'],
  'أنثى': ['متزوجة', 'عزباء', 'مطلقة', 'أرملة'],
};

export const FAMILY_CATEGORIES = [
  { key: 'martyr', label: '🕊️ أسرة شهيد' },
  { key: 'captive', label: '⛓️ أسرة أسير' },
];

export const ECONOMIC_LEVELS = [
  { key: 'extreme_poverty', label: '🔴 فقر مدقع' },
  { key: 'poor', label: '🟠 فقير' },
  { key: 'worker', label: '🟡 عامل / متوسط' },
  { key: 'employee', label: '🟢 موظف / متوسط' },
  { key: 'well_off', label: '🔵 ميسور' },
];

export const REGIONS = ['شمال غزة', 'غزة', 'الوسطى', 'جنوب غزة', 'رفح'];

export const GENDER_OPTIONS = ['ذكر', 'أنثى'];

// تسميات عربية لحقول الأسرة — تُستخدم بشاشة سجل التغييرات (منقولة حرفياً من الأصل)
export const TRACKED_FIELDS = {
  head_name: 'اسم رب الأسرة',
  head_id: 'رقم الهوية',
  head_gender: 'الجنس',
  head_dob: 'تاريخ الميلاد',
  head_marital: 'الحالة الاجتماعية',
  phone1: 'الهاتف 1',
  phone2: 'الهاتف 2',
  camp_id: 'المخيم',
  tent: 'الخيمة',
  original_address: 'العنوان الأصلي',
  address_details: 'تفاصيل العنوان',
  notes: 'ملاحظات',
  economic_level: 'المستوى الاقتصادي',
  status: 'الحالة',
};
