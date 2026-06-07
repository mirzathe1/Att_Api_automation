import playwright from 'playwright';
import XLSX from 'xlsx';

// Configuration Variables
const BASE_URL = "https://billing.therapdev.net";
const LOGIN_ENDPOINT = "/therap-api/v1/login";
const ATTENDANCE_ENDPOINT = "/therap-api/v1/attendance/inputData";
const EXCEL_FILE = "attendance_data.xlsx";

// Helper function that strips away missing or "undefined" text values safely
function sanitizeText(value) {
    if (!value || String(value).toLowerCase() === "undefined") {
        return "";
    }
    return String(value).trim();
}

async function runBulkAttendanceAudit() {
    console.log("INITIALIZING: Reading excel file data...");
    const workbook = XLSX.readFile(EXCEL_FILE);
    
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

    // 3. Create ONE Persistent Session Context (Saves Cookies automatically like Postman)
    const sessionContext = await playwright.request.newContext({ baseURL: BASE_URL });
    console.log("AUTHENTICATION: Fetching login token from server...");
    
    const loginResponse = await sessionContext.post(LOGIN_ENDPOINT, {
        form: loginCredentials,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    if (loginResponse.status() !== 200) {
        console.log("CRITICAL ERROR: Login failed with status code " + loginResponse.status());
        await sessionContext.dispose();
        return;
    }

    const loginResult = await loginResponse.json();
    const authToken = "Bearer " + loginResult.Token;
    console.log("AUTHENTICATION: Token retrieved successfully.");

    // WE DO NOT DISPOSE THE BROWSER HERE ANYMORE! This keeps the login cookies alive for the GET request.

    console.log("LOOP START: Processing data rows sequentially...");

    // 5. Main Processing Loop
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];

        // Skip row if the date column is completely empty
        if (!row.serviceDate) {
            console.log(" -> [Row " + (index + 1) + "] SKIPPED: Date cell is empty.");
            continue;
        }

        // Fix Excel Date format
        let formattedDate = "";
        if (typeof row.serviceDate === 'number') {
            const parsedDate = new Date(Date.UTC(0, 0, row.serviceDate - 1));
            formattedDate = String(parsedDate.getUTCMonth() + 1).padStart(2, '0') + "/" +
                            String(parsedDate.getUTCDate()).padStart(2, '0') + "/" +
                            parsedDate.getUTCFullYear();
        } else {
            formattedDate = String(row.serviceDate).split(" ")[0];
        }

        // Run our clean-up helper on each Excel property
        const cleanFormId   = sanitizeText(row.serviceFormId);
        const cleanTimeIn   = sanitizeText(row.timeIn);
        const cleanTimeOut  = sanitizeText(row.timeOut);
        const cleanComments = sanitizeText(row.comments);

        // FORCING STATUS TO ALL CAPS 
        let cleanStatus = "INPREP"; 
        if (row.status && String(row.status).toLowerCase() !== "undefined") {
            cleanStatus = String(row.status).trim().toUpperCase();
        }

        const dataPayload = {
            serviceDate: formattedDate,
            timeInOut: [{ timeIn: cleanTimeIn, timeOut: cleanTimeOut }],
            optionCode: row.optionCode ? String(row.optionCode).trim() : "",
            status: cleanStatus,
            serviceFormId: cleanFormId,
            comments: cleanComments
        };

        console.log(" -> [Row " + (index + 1) + "] SENDING DATA: Day " + dataPayload.serviceDate);
        console.log("    => PAYLOAD PACKAGE sent over: " + JSON.stringify(dataPayload));

        // Send data package to server
        const response = await sessionContext.post(ATTENDANCE_ENDPOINT, { 
            data: dataPayload,
            headers: {
                "Authorization": authToken,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "RequestSource": "iOS" // Adding iOS header to POST just in case
            }
        });
        
        // Evaluate outcome
        if (response.status() === 200) {
            const result = await response.json();
            const newFormId = result.formId;
            console.log("    => STATUS: SUCCESS. Generated record Form ID: " + newFormId);

            console.log("    => VERIFICATION: Double-checking database application visibility...");
            const getUrlPath = "/api/v1/attendances/" + newFormId;
            
            // Sadat Bhai's GET Request using the exact same sessionContext (Cookies + Headers)
            const verifyResponse = await sessionContext.get(getUrlPath, {
                headers: {
                    "Authorization": authToken,
                    "Accept": "application/json",
                    "RequestSource": "iOS"
                }
            });

            if (verifyResponse.status() === 200) {
                const verifyData = await verifyResponse.json();
                console.log("    => VERIFICATION RESULT: PASSED (Database confirms state: " + verifyData.status + ")");
            } else {
                console.log("    => VERIFICATION RESULT: FAILED (Server returned status code: " + verifyResponse.status() + ")");
            }
        } else {
            console.log("    => Failed");
            try {
                const serverError = await response.json();
                const actualReason = serverError.formattedErrorMessage || serverError.error_msg || "Unknown Server Exception";
                console.log("    => ERROR REASON: " + actualReason);
            } catch (err) {
                console.log("    => ERROR REASON: Server crashed completely with HTTP Status " + response.status());
            }
        }
    }

    // 6. Clean up connection only after the entire loop is finished
    await sessionContext.dispose();
    console.log("EXECUTION COMPLETE: All records processed cleanly.");
}

runBulkAttendanceAudit();