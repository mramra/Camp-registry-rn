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
 */
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAF_DIR_KEY = 'excelio_downloads_directory_uri';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * يحفظ محتوى base64 كملف Excel بمجلد التنزيلات مباشرة (أندرويد) عبر SAF،
 * مع إعادة استخدام إذن المجلد المحفوظ من مرة سابقة لو موجود. يرجع true لو
 * نجح الحفظ المباشر، أو false لو تعذّر (فيرجع الاستدعاء للمشاركة كبديل).
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

    let fileUri;
    try {
      fileUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, finalName, XLSX_MIME);
    } catch (createErr) {
      // الإذن المحفوظ صار غير صالح (المستخدم غيّر المجلد أو ألغى الإذن من
      // إعدادات النظام) -- اطلب الإذن من جديد مرة وحدة وأعد المحاولة.
      await AsyncStorage.removeItem(SAF_DIR_KEY);
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return false;
      await AsyncStorage.setItem(SAF_DIR_KEY, perm.directoryUri);
      fileUri = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, finalName, XLSX_MIME);
    }

    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return true;
  } catch {
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

function buildFinalName(fileName) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${fileName}_${dateStr}.xlsx`;
}

/**
 * يصدّر مصفوفة صفوف (objects) إلى ملف Excel، ثم يحفظه بالتنزيلات مباشرة.
 * @param {Array<Object>} rows - صفوف البيانات (كل عنصر = صف بمفاتيح = أسماء الأعمدة)
 * @param {string} sheetName - اسم الورقة داخل الملف
 * @param {string} fileName - اسم الملف (بدون امتداد)
 */
export async function exportXLSX(rows, sheetName, fileName) {
  if (!rows || rows.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const keys = Object.keys(rows[0] || {});
  ws['!cols'] = keys.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const finalName = buildFinalName(fileName);
  const result = await saveOrShare(base64, finalName);
  return result.uri;
}

/**
 * يصدّر عدة أوراق بملف Excel واحد، ثم يحفظه بالتنزيلات مباشرة.
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
    const ws = XLSX.utils.json_to_sheet(s.rows);
    const keys = Object.keys(s.rows[0] || {});
    ws['!cols'] = keys.map(() => ({ wch: 20 }));
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
