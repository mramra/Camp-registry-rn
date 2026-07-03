# نبض المخيم - React Native Edition

تطبيق React Native مع Expo لإدارة المخيمات والأسر.

## الميزات

- ✅ Hero UI Design System
- ✅ Dark Mode + Light Mode
- ✅ Supabase Integration
- ✅ Authentication كاملة
- ✅ Responsive Design
- ✅ يعمل على الويب والأندرويد

## البدء السريع

```bash
# 1. تثبيت المكتبات
npm install

# 2. تشغيل على الويب
npm start
npm run web

# 3. تشغيل على أندرويد
npm run android

# 4. تشغيل عام (اختر الخيار)
npm start
```

## بيانات الاختبار

```
البريد: 412617003@c.co
كلمة المرور: 506641234
```

## البنية الأساسية

```
src/
├── screens/        ← الشاشات
├── components/     ← المكونات
├── context/        ← State Management
├── lib/            ← Supabase
├── theme/          ← Design System
├── utils/          ← دوال مساعدة
└── navigation/     ← Navigation
```

## الألوان (Hero UI)

- **Light Mode**: ألوان فاتحة + أزرق أساسي
- **Dark Mode**: ألوان داكنة + أزرق مشرق

## المتطلبات

- Node.js >= 18
- npm أو yarn
- Expo Go (للاختبار على الموبايل)

## التطوير

كل شاشة جديدة:
1. أنشئ ملف في `src/screens/`
2. استخدم `useTheme()` للألوان
3. استخدم `useAuth()` للمصادقة
4. أضفها في `RootNavigator.jsx`

## رفع على GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/mramra/Camp-registry-rn.git
git branch -M main
git push -u origin main
```

## الدعم

للأسئلة والاقتراحات: mahmoud@example.com

---

**آخر تحديث**: يناير 2025
**الحالة**: 🟢 جاهز للاستخدام
