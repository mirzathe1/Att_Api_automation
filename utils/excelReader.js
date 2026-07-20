import XLSX from 'xlsx';

export function getExcelData(filePath) {
    const workbook = XLSX.readFile(filePath);

    // 1. Read Login Credentials
    const credSheet = workbook.Sheets["Credentials"] || workbook.Sheets["credentials"];
    const credData = XLSX.utils.sheet_to_json(credSheet);
    const loginCredentials = {
        loginName: String(credData[0].loginName),
        providerCode: String(credData[0].providerCode),
        password: String(credData[0].password)
    };

    // 2. Read Attendance Records Data
    const attendanceSheet = workbook.Sheets["AttendanceRecords"];
    const rows = XLSX.utils.sheet_to_json(attendanceSheet);

    return { loginCredentials, rows };
}

export function sanitizeText(value) {
    if (!value || String(value).toLowerCase() === "undefined") {
        return "";
    }
    return String(value).trim();
}

// --- NEW FUNCTION: The Excel Write-Back Logic (NaN Fix Applied) ---
export function incrementExcelDates(filePath) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = "AttendanceRecords";
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    for (let i = 0; i < rows.length; i++) {
        if (!rows[i].serviceDate) continue;

        let parsedDate;
        
        // 1. If it's an Excel Serial Number
        if (typeof rows[i].serviceDate === 'number') {
            parsedDate = new Date(Date.UTC(0, 0, rows[i].serviceDate - 1));
        } 
        // 2. If it's already a String (e.g., "06/01/2026")
        else {
            let dateStr = String(rows[i].serviceDate).split(" ")[0];
            let parts = dateStr.split("/"); 
            
            if (parts.length === 3) {
                // Manually map MM/DD/YYYY to avoid the NaN "Invalid Date" bug
                // Note: Months are 0-indexed in JS (so we do Month - 1)
                parsedDate = new Date(Date.UTC(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])));
            } else {
                // Fallback for weird formats
                parsedDate = new Date(dateStr); 
            }
        }

        // Add 1 day safely in UTC
        parsedDate.setUTCDate(parsedDate.getUTCDate() + 1);

        // Format strictly as MM/DD/YYYY string
        const nextDayStr = String(parsedDate.getUTCMonth() + 1).padStart(2, '0') + "/" +
                           String(parsedDate.getUTCDate()).padStart(2, '0') + "/" +
                           parsedDate.getUTCFullYear();
        
        rows[i].serviceDate = nextDayStr;
    }

    // Overwrite the sheet with the newly incremented dates
    const updatedSheet = XLSX.utils.json_to_sheet(rows);
    workbook.Sheets[sheetName] = updatedSheet;
    XLSX.writeFile(workbook, filePath);
    console.log(`\n[SYSTEM] Success! Excel dates incremented by +1 day safely.`);
}