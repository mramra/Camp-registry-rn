import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar style="light" backgroundColor="#0d1117" />
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
