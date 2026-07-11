/**
 * excelIO.js — تصدير واستيراد ملفات Excel على React Native
 *
 * التصدير يحفظ الملف مباشرة بمجلد "التنزيلات" (Downloads) على الجهاز --
 * بدون فتح قائمة اختيار تطبيقات (واتساب/مسنجر...). على أندرويد هذا يتطلب
 * إذن وصول لمجلد عبر Storage Access Framework (SAF) — يُطلب مرة واحدة
 * بس (أول تصدير)، ويُحفظ الإذن محلياً (AsyncStorage) لإعادة استخدامه
 * تلقائياً بكل تصدير لاحق بدون إزعاج المستخدم من جديد.
 * على iOS ما فيه مفهوم "تنزيلات" مماثل (قيود نظام التشغيل نفسه)، فيُستخدم
 * فيها قائمة المشاركة/الحفظ القياسية (Sharing) كبديل وحيد متاح.
 *
 * يستخدم xlsx-js-style (بديل متطابق الواجهة مع مكتبة xlsx العادية، بس
 * بدعم تنسيق مجاني كامل: تلوين، تسطير، محاذاة) بدل xlsx العادية اللي
 * تتجاهل أي تنسيق صامتاً بالنسخة المجانية.
 */
import XLSX from 'xlsx-js-style';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
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

/** يطبّق التنسيق (بانر رأسي + تناوب صفوف + توسيط) على ورقة مبنية من json_to_sheet */
function styleWorksheet(ws, rowCount, colCount) {
  for (let r = 0; r <= rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      ws[addr].s = r === 0 ? HEADER_STYLE : rowStyle((r - 1) % 2 === 0);
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

/**
 * يحفظ محتوى base64 كملف Excel بمجلد التنزيلات مباشرة (أندرويد) عبر SAF،
 * مع إعادة استخدام إذن المجلد المحفوظ من مرة سابقة لو موجود. يرجع true لو
 * نجح الحفظ المباشر، أو false لو تعذّر (فيرجع الاستدعاء للمشاركة كبديل).
 * ملاحظة مهمة: لا يطلب إذن المجلد أكثر من مرة واحدة بكل محاولة تصدير --
 * لو createFileAsync فشلت لأي سبب (مثلاً اسم ملف مكرر)، نفشل مباشرة
 * ونرجع للمشاركة، بدل ما نطلب الإذن من جديد ونربك المستخدم بصندوقين.
 */
async function saveBase64ToDownloadsAndroid(base64, finalName) {
  try {
    let dirUri = await AsyncStorage.getItem(SAF_DIR_KEY);

    if (!dirUri) {
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return false;
      dirUri = perm.directoryUri;
      await AsyncStorage.setItem(SAF_DIR_KEY, dirUri);
    }

    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, finalName, XLSX_MIME);
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return true;
  } catch {
    // الإذن المحفوظ غير صالح أو فشل الإنشاء لأي سبب -- نمسحه عشان يُطلب
    // إذن صحيح بالمحاولة الجاية، ونرجع للمشاركة الآن بدون إزعاج المستخدم
    // بصندوق ثاني بنفس هذي المحاولة.
    await AsyncStorage.removeItem(SAF_DIR_KEY);
    return false;
  }
}

/** يحفظ ملف Excel جاهز (base64) بأفضل طريقة متاحة للمنصة -- تنزيل مباشر
 * بأندرويد، أو قائمة مشاركة/حفظ بـiOS (ما فيه بديل تنزيل مباشر بـiOS). */
async function saveOrShare(base64, finalName) {
  const cacheUri = FileSystem.cacheDirectory + finalName;
  await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  if (Platform.OS === 'android') {
    const saved = await saveBase64ToDownloadsAndroid(base64, finalName);
    if (saved) return { uri: cacheUri, savedToDownloads: true };
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(cacheUri, {
      mimeType: XLSX_MIME,
      dialogTitle: finalName,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
  return { uri: cacheUri, savedToDownloads: false };
}

/** اسم ملف فريد دايماً (تاريخ + وقت لدقة الثانية) -- يمنع تصادم الاسم لو
 * صُدِّر نفس التقرير أكثر من مرة بنفس اليوم (كان سبب فشل الحفظ المباشر
 * سابقاً وطلب إذن المجلد مرتين). */
function buildFinalName(fileName) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${fileName}_${stamp}.xlsx`;
}

/**
 * يصدّر مصفوفة صفوف (objects) إلى ملف Excel منسَّق، ثم يحفظه بالتنزيلات مباشرة.
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
  const result = await saveOrShare(base64, finalName);
  return result.uri;
}

/**
 * يصدّر عدة أوراق منسَّقة بملف Excel واحد، ثم يحفظه بالتنزيلات مباشرة.
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
  const result = await saveOrShare(base64, finalName);
  return result.uri;
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

  const fileUri = result.assets[0].uri;
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const wb = XLSX.read(base64, { type: 'base64' });
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return { fileName: result.assets[0].name, sheetName: firstSheetName, rows };
}
