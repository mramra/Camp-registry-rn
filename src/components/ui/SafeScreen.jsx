/**
 * SafeScreen.jsx — غلاف شاشة موحَّد يطبّق مسافات الأمان (Safe Area) تلقائياً.
 *
 * المشكلة: شاشات React Native لا تتجنّب شريط الحالة (الساعة/البطارية/الإشعارات)
 * أو الـ notch تلقائياً كما يفعل المتصفح في نسخة الويب — لازم تطبيقها يدوياً.
 *
 * الحل: كل شاشة (Dashboard, Families, ...) تُغلَّف بـ <SafeScreen> بدل
 * <View style={{flex:1}}> مباشرة، فتُطبَّق المسافة العلوية (والسفلية
 * اختيارياً) تلقائياً حسب جهاز المستخدم الفعلي (notch، شريط حالة، إلخ).
 *
 * الاستخدام:
 *   <SafeScreen><ScrollView>...</ScrollView></SafeScreen>
 *   <SafeScreen edges={['top']}>...</SafeScreen>  ← افتراضي (الأشيع)
 *   <SafeScreen edges={['top','bottom']}>...</SafeScreen>  ← لو الشاشة فيها شريط سفلي
 */
import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../theme'

export default function SafeScreen({ children, edges = ['top'], style, backgroundColor }) {
  const insets = useSafeAreaInsets()

  const paddingStyle = {
    paddingTop:    edges.includes('top')    ? insets.top    : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft:   edges.includes('left')   ? insets.left   : 0,
    paddingRight:  edges.includes('right')  ? insets.right  : 0,
  }

  return (
    <View style={[
      styles.base,
      { backgroundColor: backgroundColor || colors.bg },
      paddingStyle,
      style,
    ]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  base: { flex: 1 },
})
