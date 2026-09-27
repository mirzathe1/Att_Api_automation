import xlsx from 'xlsx';
import { parseDate, formatDate } from './dateHelper.js';

/**
 * Sanitizes input strings safely
 * @param {*} val 
 * @returns {string}
 */
export function sanitizeText(val) {
  if (val === undefined || val === null) return "";
  return String(val).trim();
}

/**
 * Reads credentials and attendance test scenarios from Excel file in read-only mode.
 * Does NOT mutate or write back to the Excel file.
 * 
 * @param {string} filePath 
 * @returns {{ loginCredentials: { loginName: string, password: string, providerCode: string }, rows: Array<Object> }}
 */
export function getExcelData(filePath) {
  const workbook = xlsx.readFile(filePath);

  // 1. Read Credentials Sheet (with env var fallback overrides)
  const credsSheet = workbook.Sheets['Credentials'];
  if (!credsSheet) {
    throw new Error("Sheet named 'Credentials' not found in Excel file.");
  }
  const credsData = xlsx.utils.sheet_to_json(credsSheet);

  const loginCredentials = {
    loginName: process.env.THERAP_USER || credsData[0]?.loginName || credsData[0]?.username || "",
    password: process.env.THERAP_PASSWORD || credsData[0]?.password || "",
    providerCode: process.env.THERAP_PROVIDER || credsData[0]?.providerCode || ""
  };

  // 2. Read Attendance Records Sheet
  const attendanceSheet = workbook.Sheets['AttendanceRecords'];
  if (!attendanceSheet) {
    throw new Error("Sheet named 'AttendanceRecords' not found in Excel file.");
  }
  const rawRows = xlsx.utils.sheet_to_json(attendanceSheet);

  const rows = rawRows.map((row, index) => {
    const rawDate = row.serviceDate;
    const parsed = parseDate(rawDate);
    const formattedDate = parsed ? formatDate(parsed) : sanitizeText(rawDate);

    return {
      index,
      testCaseId: sanitizeText(row['Test Case ID']) || `TC-${String(index + 1).padStart(3, '0')}`,
      scenario: sanitizeText(row.Scenario) || `Scenario ${index + 1}`,
      serviceDate: formattedDate,
      rawServiceDate: rawDate,
      timeIn: sanitizeText(row.timeIn),
      timeOut: sanitizeText(row.timeOut),
      serviceFormId: sanitizeText(row.serviceFormId),
      optionCode: sanitizeText(row.optionCode),
      status: sanitizeText(row.status).toUpperCase() || 'INPREP',
      comments: sanitizeText(row.comments),
      expectedOutcome: parseInt(row['Expected Outcome'], 10) || 200,
      directBillingUnits: row.directBillingUnits !== undefined && row.directBillingUnits !== ""
        ? String(row.directBillingUnits).trim()
        : undefined,
      expectedErrorMessage: sanitizeText(row['Expected Error Message']) || ""
    };
  });

  return {
    loginCredentials,
    rows
  };
}