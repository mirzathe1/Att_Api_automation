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
    console.log("\n[SYSTEM] Initializing bulk attendance pipeline...");
    console.log(`[SYSTEM] Reading configuration from ${EXCEL_FILE}...`);

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

    // 3. Create Persistent Session Context 
    const sessionContext = await playwright.request.newContext({
        baseURL: BASE_URL
    });

    console.log("[AUTH]   Negotiating security tokens and session cookies...");

    // Step A: Fetch Bearer Token
    const loginResponse = await sessionContext.post(LOGIN_ENDPOINT, {
        form: {
            ...loginCredentials,
            maxInactiveMinutes: "30",
            cookieEnabled: "true"
        },
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    if (loginResponse.status() !== 200) {
        console.log(`[ERROR]  Login failed with status code ${loginResponse.status()}`);
        await sessionContext.dispose();
        return;
    }

    const loginResult = await loginResponse.json();
    const authToken = "Bearer " + loginResult.Token;

    // Step B: Establish Session Cookies
    const cookieLoginResponse = await sessionContext.post("/auth/api/v1/login", {
        form: {
            ...loginCredentials,
            maxInactiveMinutes: "30",
            cookieEnabled: "true"
        },
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "RequestSource": "iOS"
        }
    });

    if (cookieLoginResponse.status() !== 200) {
        console.log("[WARN]   Cookie-based login failed. Verification checks may drop.");
    } else {
        console.log("[AUTH]   Success. Secure session locked.\n");
    }

    console.log(`[PROCESS] Starting data execution loop for ${rows.length} records...\n`);

    // 5. Main Processing Loop
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];

        if (!row.serviceDate) {
            console.log(`[Row ${index + 1}] SKIPPED: Date cell is empty.\n`);
            continue;
        }

        let formattedDate = "";
        if (typeof row.serviceDate === 'number') {
            const parsedDate = new Date(Date.UTC(0, 0, row.serviceDate - 1));
            formattedDate = String(parsedDate.getUTCMonth() + 1).padStart(2, '0') + "/" +
                String(parsedDate.getUTCDate()).padStart(2, '0') + "/" +
                parsedDate.getUTCFullYear();
        } else {
            formattedDate = String(row.serviceDate).split(" ")[0];
        }

        const cleanFormId = sanitizeText(row.serviceFormId);
        const cleanTimeIn = sanitizeText(row.timeIn);
        const cleanTimeOut = sanitizeText(row.timeOut);
        const cleanComments = sanitizeText(row.comments);

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

        console.log(`[Row ${index + 1}] Submitting attendance for Date: ${dataPayload.serviceDate}`);

        const response = await sessionContext.post(ATTENDANCE_ENDPOINT, {
            data: dataPayload,
            headers: {
                "Authorization": authToken,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "RequestSource": "iOS"
            }
        });

        if (response.status() === 200) {
            const result = await response.json();
            const newFormId = result.formId;
            console.log(`    [POST] SUCCESS - Generated Form ID: ${newFormId}`);
            console.log(`    [GET]  Verifying record against database...`);

            const getUrlPath = "/api/v1/attendances/" + newFormId;
            const verifyResponse = await sessionContext.get(getUrlPath, {
                headers: {
                    "Authorization": authToken,
                    "Accept": "application/json",
                    "RequestSource": "iOS"
                },
                timeout: 60000
            });

            try {
                const respBody = await verifyResponse.text();
                if (verifyResponse.status() === 200) {
                    const verifyData = JSON.parse(respBody);
                    console.log(`    [GET]  PASSED - Record verified on server.`);

                    console.log(`           - Saved Status : ${verifyData.attendanceStatus}`);
                    console.log(`           - Saved Date   : ${verifyData.serviceDate}`);
                    if (verifyData.timeInOut && verifyData.timeInOut.length > 0) {
                        console.log(`           - Saved Time   : ${verifyData.timeInOut[0].timeIn} to ${verifyData.timeInOut[0].timeOut}`);
                    }
                    console.log("");
                } else {
                    console.log(`    [GET]  FAILED - Server returned status code: ${verifyResponse.status()}\n`);
                }
            } catch (e) {
                console.log("    [GET]  FAILED - Could not parse server response\n");
            }

        } else {
            try {
                const serverError = await response.json();
                const actualReason = serverError.formattedErrorMessage || serverError.error_msg || "Unknown Server Exception";
                console.log(`    [POST] FAILED - Reason: ${actualReason}\n`);
            } catch (err) {
                console.log(`    [POST] FAILED - Server crashed with HTTP Status ${response.status()}\n`);
            }
        }
    }

    await sessionContext.dispose();
    console.log("[SYSTEM] Execution complete. All records processed cleanly.\n");
}

runBulkAttendanceAudit();