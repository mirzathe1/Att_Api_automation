import xlsx from 'xlsx';

/**
 * Sanitizes input strings safely
 */
export function sanitizeText(val) {
    if (val === undefined || val === null) return "";
    return String(val).trim();
}

/**
 * Reads credentials from 'Credentials' sheet and rows from 'AttendanceRecords' sheet
 */
export function getExcelData(filePath) {
    const workbook = xlsx.readFile(filePath);
    
    // 1. Read Credentials Sheet
    const credsSheet = workbook.Sheets['Credentials'];
    if (!credsSheet) {
        throw new Error("Sheet named 'Credentials' not found in Excel file.");
    }
    const credsData = xlsx.utils.sheet_to_json(credsSheet);
    
    const loginCredentials = {
        loginName: credsData[0]?.loginName || credsData[0]?.username || "",
        password: credsData[0]?.password || "",
        providerCode: credsData[0]?.providerCode || ""
    };

    // 2. Read Attendance Records Sheet
    const attendanceSheet = workbook.Sheets['AttendanceRecords'];
    if (!attendanceSheet) {
        throw new Error("Sheet named 'AttendanceRecords' not found in Excel file.");
    }
    const rows = xlsx.utils.sheet_to_json(attendanceSheet);

    return {
        loginCredentials,
        rows
    };
}

/**
 * Automatically increments dates in 'AttendanceRecords' sheet for repeat runs
 */
export function incrementExcelDates(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = 'AttendanceRecords';
    const sheet = workbook.Sheets[sheetName];
    
    if (!sheet) {
        console.log(`[SYSTEM] Could not find '${sheetName}' sheet to update dates.`);
        return;
    }

    const rawData = xlsx.utils.sheet_to_json(sheet);

    const updatedData = rawData.map(row => {
        if (!row.serviceDate) return row;

        if (typeof row.serviceDate === 'number') {
            return { ...row, serviceDate: row.serviceDate + 1 };
        } else {
            const dateObj = new Date(row.serviceDate);
            if (!isNaN(dateObj.getTime())) {
                dateObj.setDate(dateObj.getDate() + 1);
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                const year = dateObj.getFullYear();
                return { ...row, serviceDate: `${month}/${day}/${year}` };
            }
        }
        return row;
    });

    const newSheet = xlsx.utils.json_to_sheet(updatedData);
    workbook.Sheets[sheetName] = newSheet;
    xlsx.writeFile(workbook, filePath);
    console.log('[SYSTEM] Excel dates successfully incremented by +1 day in AttendanceRecords.');
}

