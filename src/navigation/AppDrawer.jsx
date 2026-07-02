/**
 * AppDrawer.jsx — القائمة الجانبية المنزلقة (Drawer) — كل الشاشات الرئيسية
 * يكافئ Sidebar في camp-registry-react الأصلي، لكن كقائمة تنزلق من اليمين
 * بضغطة ☰ بدل قائمة ثابتة دائمة الظهور (قرار متفَق عليه لمناسبة شاشات
 * الموبايل الصغيرة — انظر التوثيق في الذاكرة، محادثة 2 يوليو 2026).
 *
 * كل شاشة هنا تفتح PageHeader الخاص بها بزر ☰ لفتح القائمة (بدل زر رجوع)،
 * ما عدا الشاشات التي يُنتقَل إليها من داخل شاشة أخرى (مثل FamilyForm)
 * والتي تبقى في Stack منفصل فوق الـ Drawer (انظر RootNavigator.jsx).
 */
import { createDrawerNavigator } from '@react-navigation/drawer'
import DrawerContent from './DrawerContent'
import DashboardScreen from '../screens/DashboardScreen'
import FamiliesScreen from '../screens/FamiliesScreen'
import CampsScreen from '../screens/CampsScreen'
import MovementsScreen from '../screens/MovementsScreen'
import SMSScreen from '../screens/SMSScreen'
import DistributionsScreen from '../screens/DistributionsScreen'
import UsersScreen from '../screens/UsersScreen'
import PendingRequestsScreen from '../screens/PendingRequestsScreen'
import PaperPreviewScreen from '../screens/PaperPreviewScreen'
import { colors } from '../theme'

const Drawer = createDrawerNavigator()

export default function AppDrawer() {
  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerPosition: 'right', // القائمة تنزلق من اليمين (اتساقاً مع واجهة عربية RTL)
        drawerStyle: { width: 280, backgroundColor: colors.surface },
        overlayColor: 'rgba(0,0,0,0.6)',
        swipeEdgeWidth: 60,
      }}
      drawerContent={(props) => <DrawerContent {...props} />}
    >
      <Drawer.Screen name="Dashboard" component={DashboardScreen} />
      <Drawer.Screen name="Families" component={FamiliesScreen} />
      <Drawer.Screen name="Camps" component={CampsScreen} />
      <Drawer.Screen name="Movements" component={MovementsScreen} />
      <Drawer.Screen name="SMS" component={SMSScreen} />
      <Drawer.Screen name="Distributions" component={DistributionsScreen} />
      <Drawer.Screen name="Users" component={UsersScreen} />
      <Drawer.Screen name="PendingRequests" component={PendingRequestsScreen} />
      <Drawer.Screen name="PaperPreview" component={PaperPreviewScreen} options={{ title: '🧪 معاينة Paper' }} />
    </Drawer.Navigator>
  )
}
