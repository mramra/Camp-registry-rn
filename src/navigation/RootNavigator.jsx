import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import FamiliesListScreen from '../screens/families/FamiliesListScreen';
import FamilyDetailScreen from '../screens/families/FamilyDetailScreen';
import FamilyFormScreen from '../screens/families/FamilyFormScreen';

const Stack = createNativeStackNavigator();

// Auth Navigator
const AuthNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animationEnabled: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
};

// App Navigator
const AppNavigator = () => {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FamiliesList"
        component={FamiliesListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FamilyDetail"
        component={FamilyDetailScreen}
        options={{ title: 'تفاصيل الأسرة' }}
      />
      <Stack.Screen
        name="FamilyForm"
        component={FamilyFormScreen}
        options={{ title: 'إضافة أسرة' }}
      />
    </Stack.Navigator>
  );
};

// Root Navigator
export const RootNavigator = () => {
  const { isAuthenticated, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;
