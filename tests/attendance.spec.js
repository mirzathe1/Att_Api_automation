import { test, expect, request } from '@playwright/test';
// IMPORT THE NEW FUNCTION HERE:
import { getExcelData, sanitizeText, incrementExcelDates } from '../utils/excelReader.js';
import { TherapClient } from '../api/TherapClient.js';

const BASE_URL = "https://billing.therapdev.net";
const EXCEL_FILE = "attendance_data.xlsx";

test('Bulk Attendance API Audit (Controller Pattern)', async () => {
    
    // 1. Initialize Data and API Client
    const { loginCredentials, rows } = getExcelData(EXCEL_FILE);
    const sessionContext = await request.newContext({ baseURL: BASE_URL });
    const api = new TherapClient(sessionContext, BASE_URL);

    // 2. Authenticate
    await test.step('Authenticate & Establish Session', async () => {
        await api.authenticate(loginCredentials);
    });

    // 3. Process Rows
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (!row.serviceDate) continue;

        // Format Date
        let formattedDate = typeof row.serviceDate === 'number' 
            ? new Date(Date.UTC(0, 0, row.serviceDate - 1)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
            : String(row.serviceDate).split(" ")[0];

        const dataPayload = {
            serviceDate: formattedDate,
            timeInOut: [{ timeIn: sanitizeText(row.timeIn), timeOut: sanitizeText(row.timeOut) }],
            optionCode: row.optionCode ? String(row.optionCode).trim() : "",
            status: row.status ? String(row.status).trim().toUpperCase() : "INPREP",
            serviceFormId: sanitizeText(row.serviceFormId),
            comments: sanitizeText(row.comments)
        };

        await test.step(`Process Row ${index + 1}: Date ${dataPayload.serviceDate}`, async () => {
            // POST Request
            const postResponse = await api.submitAttendance(dataPayload);
            
            // --- DEBUG LOGGING ---
            if (postResponse.status() !== 200) {
                const errorBody = await postResponse.json();
                console.log(`[422 ERROR DETAILS] Row ${index + 1}:`, errorBody);
            }

            expect(postResponse.status(), 'POST request should succeed').toBe(200);
            const result = await postResponse.json();
            const newFormId = result.formId;

            // GET Request (Verification)
            const verifyResponse = await api.verifyAttendance(newFormId);
            expect(verifyResponse.status(), 'GET verification should succeed').toBe(200);

            const verifyData = await verifyResponse.json();
            expect(verifyData.attendanceStatus).toBeDefined();
        });
    }

    // 4. Teardown & Data Rotation (Write-Back)
    await test.step('Cleanup and Rotate Test Data', async () => {
        await sessionContext.dispose();
        // Automatically push the dates forward for tomorrow's test
        incrementExcelDates(EXCEL_FILE);
    });
});