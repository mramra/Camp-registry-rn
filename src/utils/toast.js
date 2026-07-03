import { Alert } from 'react-native';

export const showToast = (message, type = 'info') => {
  const titles = {
    success: '✅ نجح',
    error: '❌ خطأ',
    info: 'ℹ️ معلومة',
    warning: '⚠️ تنبيه',
  };

  Alert.alert(titles[type] || titles.info, message, [
    {
      text: 'حسناً',
      onPress: () => {},
      style: 'default',
    },
  ]);
};

export const showError = (message) => showToast(message, 'error');
export const showSuccess = (message) => showToast(message, 'success');
export const showWarning = (message) => showToast(message, 'warning');
export const showInfo = (message) => showToast(message, 'info');

export default { showToast, showError, showSuccess, showWarning, showInfo };
