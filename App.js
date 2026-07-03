import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import PaperThemeBridge from './src/context/PaperThemeBridge';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <ThemeProvider>
      <PaperThemeBridge>
        <AuthProvider>
          <StatusBar barStyle="light-content" backgroundColor="#2563eb" />
          <RootNavigator />
        </AuthProvider>
      </PaperThemeBridge>
    </ThemeProvider>
  );
}
