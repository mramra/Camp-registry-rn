const { withAndroidManifest } = require('@expo/config-plugins');

// أندرويد 14+ (API 34) يتطلب إلزامياً تحديد foregroundServiceType لأي
// خدمة تستدعي startForeground()، وإلا تنهار الخدمة فوراً برمية
// MissingForegroundServiceTypeException. مكتبة react-native-background-actions
// (المستخدمة لإبقاء إرسال الرسائل شغّالاً بالخلفية) تصرّح بالخدمة نفسها
// تلقائياً بمانيفست خاص فيها (RNBackgroundActionsTask) لكن بدون هذا
// النوع -- هذا الـ plugin يضيفه يدوياً بعد الدمج.
const SERVICE_NAME = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
const SERVICE_TYPE = 'dataSync';
const PERMISSION = 'android.permission.FOREGROUND_SERVICE_DATA_SYNC';

function withForegroundServiceType(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    const hasPermission = manifest['uses-permission'].some(
      (p) => p.$['android:name'] === PERMISSION
    );
    if (!hasPermission) {
      manifest['uses-permission'].push({ $: { 'android:name': PERMISSION } });
    }

    const application = manifest.application && manifest.application[0];
    if (application) {
      if (!application.service) application.service = [];
      let service = application.service.find(
        (s) => s.$['android:name'] === SERVICE_NAME || s.$['android:name'] === '.RNBackgroundActionsTask'
      );
      if (service) {
        service.$['android:foregroundServiceType'] = SERVICE_TYPE;
      } else {
        // لو الدمج التلقائي من مانيفست المكتبة لسه ما صار وقت تشغيل هذا
        // الـ plugin (ترتيب التنفيذ)، نضيف تصريحاً احتياطياً كامل --
        // أندرويد يتجاهل التكرار لو الاسم نفسه اتكرر لاحقاً بلا تعارض.
        application.service.push({
          $: {
            'android:name': SERVICE_NAME,
            'android:foregroundServiceType': SERVICE_TYPE,
          },
        });
      }
    }

    return config;
  });
}

module.exports = withForegroundServiceType;
