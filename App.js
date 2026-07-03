import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <PaperProvider>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar barStyle="light-content" backgroundColor="#2563eb" />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </PaperProvider>
  );
}
