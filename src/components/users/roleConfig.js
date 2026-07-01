/**
 * roleConfig.js — تعريفات مرئية للأدوار الأربعة
 * منقول من ROLE_CONFIG داخل camp-registry-react/src/pages/Users/UsersList.jsx
 * ألوان hex مباشرة بدل كلاسات Tailwind (غير قابلة للاستخدام في RN).
 */
import { colors } from '../../theme'

export const ROLE_CONFIG = {
  platform_owner: {
    icon: '👑', label: 'مالك المنصة',
    textColor: '#facc15', bgColor: 'rgba(250,204,21,0.15)', borderColor: 'rgba(250,204,21,0.4)',
    indent: 0,
  },
  super_admin: {
    icon: '🔴', label: 'مدير الإيواء',
    textColor: colors.red, bgColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)',
    indent: 0,
  },
  camp_delegate: {
    icon: '🟠', label: 'مندوب مخيم',
    textColor: colors.accent, bgColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.4)',
    indent: 1,
  },
  assistant: {
    icon: '🟡', label: 'مساعد',
    textColor: colors.blue, bgColor: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.4)',
    indent: 2,
  },
}
