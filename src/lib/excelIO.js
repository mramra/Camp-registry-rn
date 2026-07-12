/**
 * excelIO.js — تصدير واستيراد ملفات Excel على React Native
 *
 * التصدير يبني الملف بالذاكرة، يحفظه مؤقتاً بكاش التطبيق، ثم يفتح قائمة
 * "إرسال إلى" القياسية بالجهاز (نفس الطريقة الأصلية) — فيها خيار "نسخ"
 * يقدر المستخدم يستخدمه يدوياً لحفظ الملف بأي مكان يحبه. جُرِّب سابقاً
 * حفظ مباشر بمجلد التنزيلات عبر Storage Access Framework، لكن تبيّن غير
 * موثوق (يطلب إذن المجلد من جديد كل مرة على بعض الأجهزة) فتم التراجع
 * عنه بالكامل بناءً على طلب صريح.
 *
 * يستخدم xlsx-js-style (بديل متطابق الواجهة مع مكتبة xlsx العادية، بس
 * بدعم تنسيق مجاني كامل: تلوين، تسطير، محاذاة) بدل xlsx العادية اللي
 * تتجاهل أي تنسيق صامتاً بالنسخة المجانية.
 */
/**
 * excelIO.js — تصدير واستيراد ملفات Excel على React Native
 *
 * الويب: يبني الملف كـ Blob وينزّله مباشرة (رابط تنزيل تلقائي، بدون أي
 * قائمة اختيار) -- المتصفح دايماً متصل بالنت أصلاً.
 *
 * أندرويد: يحفظ مباشرة بمجلد يختاره المستخدم مرة وحدة بس (Storage Access
 * Framework) -- الإذن يُحفظ محلياً (AsyncStorage) ويُعاد استخدامه تلقائياً
 * بكل تصدير لاحق بدون أي طلب إذن جديد. جُرِّبت هذي الآلية سابقاً وترجّع
 * عنها مؤقتاً بسبب ملاحظة إنها تطلب الإذن من جديد كل مرة على جهاز
 * الاختبار -- بإعادة المحاولة هذي المرة: أسماء ملفات فريدة لمنع تعارض
 * إنشاء الملف (سبب محتمل للمشكلة السابقة)، ورسائل toast واضحة بكل خطوة
 * عشان لو تكرر الخلل نعرف بالضبط وين يفشل. لو فشل SAF لأي سبب (رفض
 * الإذن، أو خطأ غير متوقع)، يرجع تلقائياً لقائمة "إرسال إلى" القياسية
 * بدون ما يعلّق المستخدم.
 *
 * iOS: ما فيه مفهوم "تنزيلات" مماثل (قيود نظام التشغيل نفسه)، فتُستخدم
 * قائمة المشاركة/الحفظ القياسية دائماً.
 */
import XLSX from 'xlsx-js-style';
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAF_DIR_KEY = 'excelio_downloads_directory_uri';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ── تنسيق الجدول: بانر رأسي ملوّن + تناوب أبيض/رمادي + توسيط كل الخلايا ──
const HEADER_STYLE = {
  fill: { fgColor: { rgb: 'F59E0B' } }, // برتقالي (نفس لون التطبيق المميز)
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'D1D5DB' } },
    bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
    left: { style: 'thin', color: { rgb: 'D1D5DB' } },
    right: { style: 'thin', color: { rgb: 'D1D5DB' } },
  },
};
const rowStyle = (isEven) => ({
  fill: { fgColor: { rgb: isEven ? 'F3F4F6' : 'FFFFFF' } }, // تناوب رمادي فاتح/أبيض
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'thin', color: { rgb: 'E5E7EB' } },
    bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
    left: { style: 'thin', color: { rgb: 'E5E7EB' } },
    right: { style: 'thin', color: { rgb: 'E5E7EB' } },
  },
});

/** يطبّق التنسيق (رأس بالصف headerRow + تناوب صفوف + توسيط) على ورقة */
function styleWorksheet(ws, rowCount, colCount, headerRow = 0) {
  for (let r = headerRow; r <= headerRow + rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      ws[addr].s = r === headerRow ? HEADER_STYLE : rowStyle((r - headerRow - 1) % 2 === 0);
    }
  }
}

function buildStyledSheet(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const keys = Object.keys(rows[0] || {});
  ws['!cols'] = keys.map(() => ({ wch: 20 }));
  styleWorksheet(ws, rows.length, keys.length);
  return ws;
}

// بانر معلوماتي (مثلاً: اسم المخيم + المندوب) — قد يكون صفاً واحداً أو
// عدة صفوف مدمجة بعرض الجدول كله، فوق صف العناوين مباشرة. تنسيق مميّز
// (خلفية داكنة، خط أبيض بارز). كل صف يقدر ياخذ حجم خط مستقل (مثلاً اسم
// المخيم بخط أكبر من سطر بيانات المندوب تحته).
function bannerStyle(sz) {
  return {
    fill: { fgColor: { rgb: '1F2937' } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'medium', color: { rgb: '111827' } },
      bottom: { style: 'medium', color: { rgb: '111827' } },
      left: { style: 'medium', color: { rgb: '111827' } },
      right: { style: 'medium', color: { rgb: '111827' } },
    },
  };
}

/**
 * نفس buildStyledSheet لكن مع صف/صفوف بانر مدمجة بالأعلى (فوق صف العناوين).
 * @param {Array<Object>} rows
 * @param {string|Array<{text:string, size?:number}>} banner - نص واحد (سطر
 *   وحيد بحجم افتراضي)، أو مصفوفة أسطر كل وحد بحجم خط مستقل.
 */
function buildStyledSheetWithBanner(rows, banner) {
  const keys = Object.keys(rows[0] || {});
  const lines = Array.isArray(banner) ? banner : [{ text: banner, size: 12 }];
  const bannerRowCount = lines.length;

  const ws = XLSX.utils.aoa_to_sheet(lines.map((l) => [l.text]));
  XLSX.utils.sheet_add_json(ws, rows, { origin: `A${bannerRowCount + 1}` });
  ws['!cols'] = keys.map(() => ({ wch: 20 }));

  ws['!merges'] = lines.map((_, i) => ({ s: { r: i, c: 0 }, e: { r: i, c: Math.max(keys.length - 1, 0) } }));
  ws['!rows'] = lines.map((l) => ({ hpx: Math.max(22, (l.size || 12) * 1.8) }));
  lines.forEach((l, i) => {
    const cellRef = XLSX.utils.encode_cell({ r: i, c: 0 });
    ws[cellRef].s = bannerStyle(l.size || 12);
  });

  styleWorksheet(ws, rows.length, keys.length, bannerRowCount); // صف العناوين الفعلي بعد البانر
  return ws;
}

/**
 * يحفظ محتوى base64 كملف Excel بمجلد يختاره المستخدم مباشرة (أندرويد)
 * عبر SAF، مع إعادة استخدام إذن المجلد المحفوظ من مرة سابقة لو موجود.
 * يرجع true لو نجح الحفظ المباشر، أو false لو تعذّر (فيرجع الاستدعاء
 * للمشاركة كبديل مضمون).
 */
async function saveBase64ToDownloadsAndroid(base64, finalName) {
  let step = 'طلب إذن المجلد الأول';
  try {
    let dirUri = await AsyncStorage.getItem(SAF_DIR_KEY);

    if (!dirUri) {
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return false;
      dirUri = perm.directoryUri;
      await AsyncStorage.setItem(SAF_DIR_KEY, dirUri);
    }

    let fileUri;
    step = 'إنشاء الملف بالمجلد المحفوظ';
    try {
      fileUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, finalName, XLSX_MIME);
    } catch (createErr) {
      // الإذن المحفوظ صار غير صالح (المستخدم غيّر المجلد، ألغى الإذن من
      // إعدادات النظام، أو النظام أسقط الإذن بعد إغلاق التطبيق بالكامل
      // على بعض الأجهزة) -- اطلب الإذن من جديد مرة وحدة وأعد المحاولة.
      await AsyncStorage.removeItem(SAF_DIR_KEY);
      step = 'طلب إذن مجلد جديد (بعد فشل الأول)';
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return false;
      await AsyncStorage.setItem(SAF_DIR_KEY, perm.directoryUri);
      step = 'إنشاء الملف بالمجلد الجديد';
      fileUri = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, finalName, XLSX_MIME);
    }

    step = 'كتابة محتوى الملف';
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return true;
  } catch (err) {
    const rawMsg = err?.message || err?.code || JSON.stringify(err) || 'غير معروف';

    // قيد رسمي موثّق من Google نفسها: بدءاً من أندرويد 11، ممنوع منح صلاحية
    // كتابة لمجلد "Downloads" الأساسي عبر SAF مهما حاولنا -- مو خلل بالتطبيق
    // ولا بالمحاولة، النظام نفسه يرفضها دائماً لهذا المجلد بالذات (مصدر:
    // developer.android.com/training/data-storage/shared/documents-files).
    // نمسح الإذن المحفوظ فوراً عشان ما يعيد نفس المجلد المكسور تلقائياً،
    // ونوضّح للمستخدم يختار مجلد ثاني المرة الجاية.
    const isDownloadsRestriction = /downloads/i.test(rawMsg) && /writable|denial|denied|permission/i.test(rawMsg);
    await AsyncStorage.removeItem(SAF_DIR_KEY);

    const title = isDownloadsRestriction ? 'مجلد "التنزيلات" غير مسموح بالكتابة فيه' : 'تعذّر الحفظ المباشر';
    const message = isDownloadsRestriction
      ? 'هذا قيد من أندرويد نفسه (بدءاً من أندرويد 11): ممنوع أي تطبيق يكتب مباشرة بمجلد "Downloads" الأساسي، حتى لو وافقت على الإذن.\n\n' +
        'الحل: المرة الجاية لما تظهر لك نافذة اختيار المجلد، اختر مجلد ثاني غير "Downloads" نفسه -- مثلاً افتح تطبيق "الملفات" بجوالك، سوّي مجلد جديد باسم "تقارير نبض المخيم" (أي مكان)، وبعدها اختره من نافذة الاختيار. أو اختر مجلد "Documents" لو موجود.\n\n' +
        'بالضغط "حسناً" رح تفتح قائمة المشاركة كبديل حالياً.'
      : `فشلت الخطوة: ${step}\n\nنص الخطأ: ${rawMsg}\n\nبالضغط "حسناً" رح تفتح قائمة المشاركة كبديل.`;

    // رسالة toast تختفي بسرعة على بعض الأجهزة قبل ما تُقرأ -- Alert ثابت
    // يبقى لحد ما يضغط المستخدم "حسناً". المهم هنا: ننتظر فعلياً ضغطة
    // المستخدم (await) قبل ما نرجع ونكمل لقائمة المشاركة -- قبل هذا
    // التعديل كان الكود يكمل فوراً لفتح قائمة المشاركة فوق نافذة التنبيه
    // فيسكّرها قبل ما تُقرأ، بالضبط نفس العرض اللي وصفه المستخدم.
    await new Promise((resolve) => {
      Alert.alert(title, message, [{ text: 'حسناً', onPress: resolve }], { cancelable: false });
    });
    return false;
  }
}

/** يحفظ الملف بأفضل طريقة متاحة للمنصة -- تنزيل مباشر بالويب، حفظ مباشر
 * بمجلد مُختار مرة واحدة بأندرويد، أو قائمة مشاركة/حفظ بـiOS. */
async function saveAndShare(base64, finalName) {
  // الويب: لا وجود لـ FileSystem.cacheDirectory ولا Sharing على المتصفح --
  // نبني الملف كـ Blob وننزّله مباشرة عبر رابط تنزيل تلقائي (نفس سلوك أي
  // موقع ويب عادي)، بدل الاعتماد على واجهات native غير المدعومة بالويب.
  if (Platform.OS === 'web') {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return url;
  }

  if (Platform.OS === 'android') {
    const saved = await saveBase64ToDownloadsAndroid(base64, finalName);
    if (saved) return true;
    // فشل الحفظ المباشر لأي سبب -- نكمل بالطريقة الاحتياطية بالأسفل
  }

  const cacheUri = FileSystem.cacheDirectory + finalName;
  await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(cacheUri, {
      mimeType: XLSX_MIME,
      dialogTitle: finalName,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
  return cacheUri;
}

function buildFinalName(fileName) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds()).padStart(3, '0')}`;
  return `${fileName}_${stamp}.xlsx`;
}

/**
 * يصدّر مصفوفة صفوف (objects) إلى ملف Excel منسَّق، ثم يفتح قائمة الإرسال.
 * @param {Array<Object>} rows - صفوف البيانات (كل عنصر = صف بمفاتيح = أسماء الأعمدة)
 * @param {string} sheetName - اسم الورقة داخل الملف
 * @param {string} fileName - اسم الملف (بدون امتداد)
 */
export async function exportXLSX(rows, sheetName, fileName) {
  if (!rows || rows.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }

  const ws = buildStyledSheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const finalName = buildFinalName(fileName);
  return saveAndShare(base64, finalName);
}

/**
 * يصدّر عدة أوراق منسَّقة بملف Excel واحد، ثم يفتح قائمة الإرسال.
 * @param {Array<{name: string, rows: Array<Object>}>} sheets - كل عنصر ورقة مستقلة
 * @param {string} fileName - اسم الملف (بدون امتداد)
 */
export async function exportXLSXMultiSheet(sheets, fileName) {
  const validSheets = (sheets || []).filter((s) => s.rows && s.rows.length > 0);
  if (validSheets.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }

  const wb = XLSX.utils.book_new();
  validSheets.forEach((s) => {
    const ws = buildStyledSheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31)); // حد Excel: 31 حرف لاسم الورقة
  });

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const finalName = buildFinalName(fileName);
  return saveAndShare(base64, finalName);
}

/**
 * يصدّر عدة أوراق منسَّقة، كل وحدة معها بانر معلوماتي بأعلاها (مثلاً اسم
 * مخيم + مندوبه)، بملف Excel واحد.
 * @param {Array<{name: string, banner: string, rows: Array<Object>}>} sheets
 * @param {string} fileName - اسم الملف (بدون امتداد)
 */
export async function exportXLSXMultiSheetWithBanners(sheets, fileName) {
  const validSheets = (sheets || []).filter((s) => s.rows && s.rows.length > 0);
  if (validSheets.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }

  const wb = XLSX.utils.book_new();
  validSheets.forEach((s) => {
    const ws = buildStyledSheetWithBanner(s.rows, s.banner || s.name);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31)); // حد Excel: 31 حرف لاسم الورقة
  });

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const finalName = buildFinalName(fileName);
  return saveAndShare(base64, finalName);
}

/**
 * يفتح منتقي الملفات، يقرأ أول ورقة من ملف Excel مختار، ويرجع
 * الصفوف كمصفوفة objects (رأس الجدول = مفاتيح كل صف).
 * يرجع null لو ألغى المستخدم الاختيار.
 */
export async function pickAndParseXLSX() {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  let base64;
  if (Platform.OS === 'web') {
    // الويب: لا وجود لمسار ملف حقيقي -- الملف يوصل كـ File object مباشرة
    // من متصفح المستخدم (result.assets[0].file)، نقرأه عبر FileReader.
    const file = result.assets[0].file;
    base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('تعذّر قراءة الملف'));
      reader.readAsDataURL(file);
    });
  } else {
    const fileUri = result.assets[0].uri;
    base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  const wb = XLSX.read(base64, { type: 'base64' });
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return { fileName: result.assets[0].name, sheetName: firstSheetName, rows };
}
