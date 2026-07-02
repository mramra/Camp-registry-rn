/**
 * PageHeader.jsx — منقول من camp-registry-react/src/components/ui/PageHeader.jsx
 * نفس الشكل (أيقونة + عنوان + عنوان فرعي + إجراء اختياري على اليمين)
 * useNavigate → useNavigation (@react-navigation/native)
 *
 * ⚠️ إضافة (2 يوليو 2026): خيار menu={true} يعرض زر ☰ يفتح القائمة
 * الجانبية (Drawer) تلقائياً — يُستخدم في كل الشاشات الرئيسية (المتاحة
 * من القائمة نفسها) بدل الاعتماد فقط على إيماءة السحب من الحافة، والتي
 * قد لا تكون واضحة لكل مستخدم. back وmenu متنافيان منطقياً (شاشة إما
 * "رئيسية داخل القائمة" أو "فرعية بزر رجوع"، ليس الاثنين معاً).
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useNavigation, DrawerActions } from '@react-navigation/native'
import { colors } from '../../theme'

export default function PageHeader({ title, icon, subtitle, back, menu, action }) {
  const navigation = useNavigation()
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {back && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
        )}
        {menu && !back && (
          <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.menuBtn}>
            <Text style={styles.menuText}>☰</Text>
          </TouchableOpacity>
        )}
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? (
            typeof subtitle === 'string'
              ? <Text style={styles.subtitle}>{subtitle}</Text>
              : subtitle // يسمح بتمرير View/Text مخصص (نفس مرونة JSX subtitle بالأصل)
          ) : null}
        </View>
      </View>
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingTop: 6,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { paddingHorizontal: 4 },
  backText: { color: colors.muted, fontSize: 18 },
  menuBtn: { paddingHorizontal: 4 },
  menuText: { color: colors.white, fontSize: 20 },
  icon: { fontSize: 24 },
  title: { color: colors.white, fontWeight: '900', fontSize: 17 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
})
