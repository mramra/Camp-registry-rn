import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import UnderMigrationScreen from '../screens/UnderMigrationScreen';
import colors from '../theme/colors';

const Stack = createNativeStackNavigator();

// ثيم التنقل مطابق لألوان الأصل (داكن، حدود، برتقالي)
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    border: colors.border,
    text: colors.white,
    primary: colors.accent,
  },
};

const RootNavigator = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '900' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen
              name="Dashboard"
              component={DashboardScreen}
              options={{ title: '🏕️ نبض المخيم' }}
            />
            {/* شاشات لم تُنقل بعد — تُستبدل تدريجياً بالشاشات الفعلية */}
            <Stack.Screen name="FamiliesList" component={UnderMigrationScreen} options={{ title: 'قائمة الأسر' }} />
            <Stack.Screen name="FamilyForm" component={UnderMigrationScreen} options={{ title: 'إضافة أسرة' }} />
            <Stack.Screen name="CampsList" component={UnderMigrationScreen} options={{ title: 'المخيمات' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
