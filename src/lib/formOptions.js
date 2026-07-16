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

// فئتا "أسرة شهيد" و"أسرة أسير" تظهران فقط لما رب الأسرة أنثى (أرملة الشهيد
// أو زوجة الأسير هي المسجَّلة كرب أسرة بهذي الحالات) — femaleOnly تُفحص
// بواجهة النموذج قبل عرض الخيار.
export const FAMILY_CATEGORIES = [
  { key: 'martyr', label: '🕊️ أسرة شهيد', femaleOnly: true },
  { key: 'captive', label: '⛓️ أسرة أسير', femaleOnly: true },
];

export const REGIONS = ['شمال غزة', 'غزة', 'الوسطى', 'جنوب غزة', 'رفح'];

export const INCOME_SOURCE_OPTIONS = ['قطاع خاص', 'قطاع حكومي', 'عمل حر', 'مساعدات فقط', 'لا يعمل'];
export const HOUSING_TYPE_OPTIONS = ['خيمة', 'بيت', 'حاصل', 'شقة مستأجرة', 'مركز إيواء جماعي'];
export const HOUSING_CONDITION_OPTIONS = ['سليم', 'هدم جزئي', 'هدم كلي', 'غير قابل للسكن'];
export const DISPLACEMENT_STATUS_OPTIONS = ['نازح', 'مقيم'];

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
  address: 'السكن الحالي',
  governorate_current: 'محافظة السكن الحالي',
  displacement_status: 'حالة النزوح',
  housing_type: 'نوع المسكن',
  housing_condition: 'حالة المسكن',
  income_source: 'مصدر الدخل',
  notes: 'ملاحظات',
  status: 'الحالة',
};
