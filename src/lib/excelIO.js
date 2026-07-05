/**
 * excelIO.js — تصدير واستيراد ملفات Excel على React Native
 * (نسخة معادلة لـ excelExport.js الأصلي، لكن مبنية على تقنيات الموبايل
 * بدل التنزيل المباشر بالمتصفح: بناء الملف بالذاكرة → حفظه فعلياً على
 * الجهاز عبر expo-file-system → فتح قائمة مشاركة/حفظ عبر expo-sharing)
 */
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

/**
 * يصدّر مصفوفة صفوف (objects) إلى ملف Excel، ثم يفتح قائمة مشاركة/حفظ.
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

  // بناء الملف كـ base64 (متوافق مع نظام ملفات الموبايل)
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const dateStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const finalName = `${fileName}_${dateStr}.xlsx`;
  const fileUri = FileSystem.cacheDirectory + finalName;

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: finalName,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }

  return fileUri;
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
