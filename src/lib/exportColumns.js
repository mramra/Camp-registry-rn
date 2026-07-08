/**
 * exportColumns.js — مصدر واحد لتعريفات أعمدة التصدير
 * (منقول حرفياً من camp-registry-react/src/lib/exportColumns.js)
 * يُستخدم في ExportScreen (التصدير السريع والتصدير المخصص معاً).
 */
import { calcAge } from './helpers';

// ── حقول رباب الأسر (مع الزوجة) ─────────────────────────
export const FAM_COLS = [
  { key: 'head_name', label: 'اسم رب الأسرة', def: true },
  { key: 'head_id', label: 'رقم هوية رب الأسرة', def: true },
  { key: 'wife_name', label: 'اسم الزوجة', def: true },
  { key: 'wife_id', label: 'هوية الزوجة', def: true },
  { key: 'phone1', label: 'رقم الجوال', def: true },
  { key: 'phone2', label: 'جوال بديل', def: false },
  { key: 'camp', label: 'المخيم', def: true },
  { key: 'tent', label: 'رقم الخيمة', def: true },
  { key: 'head_dob', label: 'تاريخ ميلاد رب الأسرة', def: false },
  { key: 'head_gender', label: 'الجنس', def: false },
  { key: 'head_marital', label: 'الحالة الاجتماعية', def: true },
  { key: 'members_count', label: 'عدد الأفراد', def: true },
  { key: 'category_tags', label: 'الفئة الاجتماعية', def: false },
  { key: 'original_address', label: 'العنوان الأصلي', def: false },
  { key: 'notes', label: 'ملاحظات', def: false },
];

// ── حقول الأفراد ──────────────────────────────────────────
export const MEM_COLS = [
  { key: 'tent', label: 'رقم الخيمة', def: true },
  { key: 'fam_name', label: 'اسم رب الأسرة', def: true },
  { key: 'head_id', label: 'هوية رب الأسرة', def: true },
  { key: 'phone1', label: 'رقم الجوال', def: true },
  { key: 'camp', label: 'المخيم', def: true },
  { key: 'name', label: 'اسم الفرد', def: true },
  { key: 'national_id', label: 'رقم هوية الفرد', def: true },
  { key: 'relation', label: 'صلة القرابة', def: true },
  { key: 'dob', label: 'تاريخ الميلاد', def: false },
  { key: 'age', label: 'العمر', def: true },
  { key: 'gender', label: 'الجنس', def: false },
  { key: 'health', label: 'الحالة الصحية', def: false },
  { key: 'chronic_diseases', label: 'أمراض مزمنة', def: false },
  { key: 'disabilities', label: 'الإعاقات', def: false },
];

/** يجد زوجة الأسرة من قائمة أفرادها (relation = زوجة/زوجه) */
export function findWife(members) {
  return (members || []).find((m) => ['زوجة', 'زوجه'].includes(m.relation || ''));
}

/** يُرجع قيمة عمود رب الأسرة (يغطي كل مفاتيح FAM_COLS بما فيها الزوجة) */
export function resolveFamilyColumn(key, family, { campName, membersCount, wife } = {}) {
  switch (key) {
    case 'head_name': return family.head_name || '';
    case 'head_id': return family.head_id || '';
    case 'wife_name': return wife?.name || '';
    case 'wife_id': return wife?.national_id || '';
    case 'phone1': return family.phone1 || '';
    case 'phone2': return family.phone2 || '';
    case 'camp': return campName ?? family.camps?.name ?? '';
    case 'tent': return family.tent || '';
    case 'head_dob': return family.head_dob || '';
    case 'head_gender': return family.head_gender || '';
    case 'head_marital': return family.head_marital || '';
    case 'members_count': return membersCount ?? ((family.family_members?.length || 0) + 1);
    case 'category_tags': return (Array.isArray(family.category_tags) ? family.category_tags : []).join('، ');
    case 'original_address': return family.original_address || '';
    case 'notes': return family.notes || '';
    default: return '';
  }
}

/** يُرجع قيمة عمود فرد */
export function resolveMemberColumn(key, member, family, { campName } = {}) {
  switch (key) {
    case 'tent': return family?.tent || '';
    case 'fam_name': return family?.head_name || '';
    case 'head_id': return family?.head_id || '';
    case 'phone1': return family?.phone1 || '';
    case 'camp': return campName ?? family?.camps?.name ?? '';
    case 'name': return member?.name || '';
    case 'national_id': return member?.national_id || '';
    case 'relation': return member?.relation || '';
    case 'dob': return member?.dob || '';
    case 'age': return calcAge(member?.dob) ?? '';
    case 'gender': return member?.gender || '';
    case 'health': return member?.health || '';
    case 'chronic_diseases': return member?.chronic_diseases || '';
    case 'disabilities': return member?.disabilities || '';
    default: return '';
  }
}
