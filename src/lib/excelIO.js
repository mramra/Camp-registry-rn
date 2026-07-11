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
import XLSX from 'xlsx-js-style';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

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

// بانر معلوماتي (مثلاً: اسم المخيم + المندوب) — صف واحد مدمج بعرض الجدول
// كله، فوق صف العناوين مباشرة. تنسيق مميّز (خلفية داكنة، خط أبيض بارز).
const BANNER_STYLE = {
  fill: { fgColor: { rgb: '1F2937' } },
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'medium', color: { rgb: '111827' } },
    bottom: { style: 'medium', color: { rgb: '111827' } },
    left: { style: 'medium', color: { rgb: '111827' } },
    right: { style: 'medium', color: { rgb: '111827' } },
  },
};

/** نفس buildStyledSheet لكن مع صف بانر مدمج بالأعلى (فوق صف العناوين) */
function buildStyledSheetWithBanner(rows, bannerText) {
  const keys = Object.keys(rows[0] || {});
  const ws = XLSX.utils.aoa_to_sheet([[bannerText]]);
  XLSX.utils.sheet_add_json(ws, rows, { origin: 'A2' });
  ws['!cols'] = keys.map(() => ({ wch: 20 }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(keys.length - 1, 0) } }];
  // ارتفاع صف أكبر يتناسب مع عدد أسطر البانر (كل سطر ~18px + هامش)
  const lineCount = (bannerText.match(/\n/g) || []).length + 1;
  ws['!rows'] = [{ hpx: Math.max(24, lineCount * 20) }];
  ws['A1'].s = BANNER_STYLE;
  styleWorksheet(ws, rows.length, keys.length, 1); // صف العناوين الفعلي بالإندكس 1 (بعد البانر)
  return ws;
}

/** يحفظ الملف مؤقتاً بالكاش، ثم يفتح قائمة "إرسال إلى" (فيها خيار نسخ). */
async function saveAndShare(base64, finalName) {
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
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
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
