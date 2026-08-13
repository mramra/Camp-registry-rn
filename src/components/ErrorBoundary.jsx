/**
 * ErrorBoundary — يمنع انهيار التطبيق كاملاً (شاشة بيضاء صامتة) عند أي
 * خطأ render غير متوقع بأي شاشة. يعرض رسالة واضحة بدل الانهيار الصامت،
 * وهذا مهم خصوصاً لأن محمود يعمل من الموبايل بدون أي وصول لـ console
 * لتشخيص "الشاشة البيضاء" لو صارت.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>⚠️ حدث خطأ غير متوقع</Text>
          <Text style={styles.message}>
            {this.state.error?.message || 'حدث خطأ أثناء عرض هذه الشاشة'}
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#f59e0b',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    color: '#c9d1d9',
    fontSize: 15,
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#0d1117',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
