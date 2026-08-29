// // import { test, expect, request } from '@playwright/test';
// // import { getExcelData, sanitizeText, incrementExcelDates } from '../utils/excelReader.js';
// // import { TherapClient } from '../api/TherapClient.js';

// // const BASE_URL = "https://billing.therapdev.net";
// // const EXCEL_FILE = "attendance_data.xlsx";

// // // Helper function to create a delay
// // const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// // test('Bulk Attendance API Audit (Controller Pattern)', async () => {
    
// //     // 1. Initialize Data and API Client
// //     const { loginCredentials, rows } = getExcelData(EXCEL_FILE);
// //     const sessionContext = await request.newContext({ baseURL: BASE_URL });
// //     const api = new TherapClient(sessionContext, BASE_URL);

// //     // 2. Authenticate
// //     await test.step('Authenticate & Establish Session', async () => {
// //         await api.authenticate(loginCredentials);
// //     });

// //     // 3. Process Rows
// //     for (let index = 0; index < rows.length; index++) {
// //         const row = rows[index];
// //         if (!row.serviceDate) continue;

// //         // Format Date
// //         let formattedDate = typeof row.serviceDate === 'number' 
// //             ? new Date(Date.UTC(0, 0, row.serviceDate - 1)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
// //             : String(row.serviceDate).split(" ")[0];

// //         const dataPayload = {
// //             serviceDate: formattedDate,
// //             timeInOut: [{ timeIn: sanitizeText(row.timeIn), timeOut: sanitizeText(row.timeOut) }],
// //             optionCode: row.optionCode ? String(row.optionCode).trim() : "",
// //             status: row.status ? String(row.status).trim().toUpperCase() : "INPREP",
// //             serviceFormId: sanitizeText(row.serviceFormId),
// //             comments: sanitizeText(row.comments)
// //         };

// //         await test.step(`Process Row ${index + 1}: Date ${dataPayload.serviceDate}`, async () => {
// //             // POST Request
// //             const postResponse = await api.submitAttendance(dataPayload);
            
// //             if (postResponse.status() !== 200) {
// //                 const errorBody = await postResponse.json();
// //                 console.log(`[POST ERROR DETAILS] Row ${index + 1}:`, errorBody);
// //             }

// //             expect(postResponse.status(), 'POST request should succeed').toBe(200);
// //             const result = await postResponse.json();
// //             const newFormId = result.formId;

// //             // Wait for 3 seconds to allow database replication/permissions to sync
// //             await delay(3000); 

// //             // GET Request (Verification)
// //             const verifyResponse = await api.verifyAttendance(newFormId);
            
// //             if (verifyResponse.status() !== 200) {
// //                 const errorText = await verifyResponse.text();
// //                 console.log(`[GET ERROR DETAILS] Row ${index + 1} | Status: ${verifyResponse.status()} | Body:`, errorText);
// //             }

// //             expect(verifyResponse.status(), 'GET verification should succeed').toBe(200);

// //             const verifyData = await verifyResponse.json();
// //             expect(verifyData.attendanceStatus).toBeDefined();
// //         });
// //     }

// //     // 4. Teardown & Data Rotation (Write-Back)
// //     await test.step('Cleanup and Rotate Test Data', async () => {
// //         await sessionContext.dispose();
// //         incrementExcelDates(EXCEL_FILE);
// //     });
// // });



// import { test, expect, request } from '@playwright/test';
// import fs from 'fs'; // ADDED: File system module to read/write state
// import { getExcelData, sanitizeText, incrementExcelDates } from '../utils/excelReader.js';
// import { TherapClient } from '../api/TherapClient.js';

// const BASE_URL = "https://billing.therapdev.net";
// // UPDATED: Referencing the new Excel file verbatim
// const EXCEL_FILE = "attendance_data.xlsx"; 
// const STATE_FILE = "execution_state.json"; // ADDED: Tracks our progress

// const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// test('Bulk Attendance API Audit (Controller Pattern)', async () => {
    
//     // --- ADD THIS LINE TO FIX THE TIMEOUT ---
//     test.setTimeout(0); // 0 disables the timeout entirely. You can also use 300000 for 5 minutes.

//     // --- 1. Load Execution State ---
//     let state = { lastProcessedIndex: -1 };
//     if (fs.existsSync(STATE_FILE)) {
//         state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
//     }
    
//     // 2. Initialize Data and API Client
//     const { loginCredentials, rows } = getExcelData(EXCEL_FILE);
//     const sessionContext = await request.newContext({ baseURL: BASE_URL });
//     const api = new TherapClient(sessionContext, BASE_URL);

//     // Calculate where to start this run
//     let startIndex = state.lastProcessedIndex + 1;
    
//     // Failsafe: Reset state if we somehow go out of bounds
//     if (startIndex >= rows.length) {
//         startIndex = 0;
//         state.lastProcessedIndex = -1;
//     }

//     if (startIndex > 0) {
//         console.log(`\n[SYSTEM] Resuming execution from Row ${startIndex + 1}...`);
//     }

//     // 3. Authenticate
//     await test.step('Authenticate & Establish Session', async () => {
//         await api.authenticate(loginCredentials);
//     });

//     // 4. Process Rows (Starting from our saved index!)
//     for (let index = startIndex; index < rows.length; index++) {
//         const row = rows[index];
        
//         if (!row.serviceDate) {
//             // Skip empty rows but mark them as processed to keep index accurate
//             state.lastProcessedIndex = index;
//             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
//             continue;
//         }

//         // Format Date
//         let formattedDate = typeof row.serviceDate === 'number' 
//             ? new Date(Date.UTC(0, 0, row.serviceDate - 1)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
//             : String(row.serviceDate).split(" ")[0];

//         const dataPayload = {
//             serviceDate: formattedDate,
//             timeInOut: [{ timeIn: sanitizeText(row.timeIn), timeOut: sanitizeText(row.timeOut) }],
//             optionCode: row.optionCode ? String(row.optionCode).trim() : "",
//             status: row.status ? String(row.status).trim().toUpperCase() : "INPREP",
//             serviceFormId: sanitizeText(row.serviceFormId),
//             comments: sanitizeText(row.comments)
//         };

//         await test.step(`Process Row ${index + 1}: Date ${dataPayload.serviceDate}`, async () => {
//             // POST Request
//             const postResponse = await api.submitAttendance(dataPayload);
            
//             if (postResponse.status() !== 200) {
//                 const errorBody = await postResponse.json();
//                 console.log(`[POST ERROR DETAILS] Row ${index + 1}:`, errorBody);
//             }

//             expect(postResponse.status(), 'POST request should succeed').toBe(200);
//             const result = await postResponse.json();
//             const newFormId = result.formId;

//             // Wait for DB replication
//             //  await delay(60000); 

//             // GET Request (Verification)
//             const verifyResponse = await api.verifyAttendance(newFormId);
            
//             if (verifyResponse.status() !== 200) {
//                 const errorText = await verifyResponse.text();
//                 console.log(`[GET ERROR DETAILS] Row ${index + 1} | Status: ${verifyResponse.status()} | Body:`, errorText);
//             }

//             expect(verifyResponse.status(), 'GET verification should succeed').toBe(200);

//             const verifyData = await verifyResponse.json();
//             expect(verifyData.attendanceStatus).toBeDefined();
            
//             // --- Save State ONLY after successful verification ---
//             // If the script crashes or fails on this row, it won't save, 
//             // ensuring it retries this exact row on the next run.
//             state.lastProcessedIndex = index;
//             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

//             console.log(`[SUCCESS] Row ${index + 1} processed and verified successfully!`);
//         });
//     }

//     // 5. Teardown & Data Rotation (Write-Back)
//     await test.step('Cleanup and Rotate Test Data', async () => {
//         await sessionContext.dispose();
        
//         // --- Conditionally Increment Dates ---
//         if (state.lastProcessedIndex >= rows.length - 1) {
//             console.log('\n[SYSTEM] All rows in file processed. Incrementing dates for the next cycle.');
//             incrementExcelDates(EXCEL_FILE);
            
//             // Wipe the state clean so the next execution starts at Row 1 with new dates
//             state.lastProcessedIndex = -1;
//             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
//         } else {
//             console.log(`\n[SYSTEM] Execution paused/stopped. Next run will resume at Row ${state.lastProcessedIndex + 2}. Dates were NOT incremented.`);
//         }
//     });
// });


import { test, expect, request } from '@playwright/test';
import fs from 'fs';
import { getExcelData, sanitizeText, incrementExcelDates } from '../utils/excelReader.js';
import { TherapClient } from '../api/TherapClient.js';

const BASE_URL = "https://billing.therapdev.net";
const EXCEL_FILE = "attendance_data.xlsx"; 
const STATE_FILE = "execution_state.json"; 

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('Bulk Attendance API Audit (Controller Pattern)', async () => {
    
    // Disable timeout so the 60-second waits don't kill the test
    test.setTimeout(0); 

    // 1. Load Execution State
    let state = { lastProcessedIndex: -1 };
    if (fs.existsSync(STATE_FILE)) {
        state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
    
    // 2. Initialize Data and API Client
    const { loginCredentials, rows } = getExcelData(EXCEL_FILE);
    const sessionContext = await request.newContext({ baseURL: BASE_URL });
    const api = new TherapClient(sessionContext, BASE_URL);

    // Calculate where to start this run
    let startIndex = state.lastProcessedIndex + 1;
    
    // Failsafe: Reset state if we somehow go out of bounds
    if (startIndex >= rows.length) {
        startIndex = 0;
        state.lastProcessedIndex = -1;
    }

    if (startIndex > 0) {
        console.log(`\n[SYSTEM] Resuming execution from Row ${startIndex + 1}...`);
    }

    // 3. Authenticate
    await test.step('Authenticate & Establish Session', async () => {
        await api.authenticate(loginCredentials);
    });

    // 4. Process Rows
    for (let index = startIndex; index < rows.length; index++) {
        const row = rows[index];
        
        if (!row.serviceDate) {
            state.lastProcessedIndex = index;
            fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
            continue;
        }

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
            
            // --- OPTION B: GRACEFUL FAILURE HANDLING ---
            if (postResponse.status() !== 200) {
                const errorBody = await postResponse.json();
                console.log(`\n[FAILED] Row ${index + 1} API Error:`, errorBody);
                
                // Mark this row as processed so we don't get stuck in an infinite retry loop tomorrow
                state.lastProcessedIndex = index;
                fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
                
                // Use Playwright's soft expect to log the failure in the final HTML report, 
                // but the 'return' statement below stops this specific step and continues the loop!
                expect.soft(postResponse.status(), `POST failed for row ${index + 1}`).toBe(200);
                return; 
            }

            const result = await postResponse.json();
            const newFormId = result.formId;

            // Wait for DB replication
            // await delay(60000); 

            // GET Request (Verification)
            const verifyResponse = await api.verifyAttendance(newFormId);
            
            if (verifyResponse.status() !== 200) {
                const errorText = await verifyResponse.text();
                console.log(`\n[GET ERROR DETAILS] Row ${index + 1} | Status: ${verifyResponse.status()} | Body:`, errorText);
            }

            expect(verifyResponse.status(), 'GET verification should succeed').toBe(200);

            const verifyData = await verifyResponse.json();
            expect(verifyData.attendanceStatus).toBeDefined();
            
            // Save State upon full success
            state.lastProcessedIndex = index;
            fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
            
            // --- SUCCESS LOGGING ---
            console.log(`[SUCCESS] Row ${index + 1} created and verified successfully!`);
        });
    }

    // 5. Teardown & Data Rotation (Write-Back)
    await test.step('Cleanup and Rotate Test Data', async () => {
        await sessionContext.dispose();
        
        if (state.lastProcessedIndex >= rows.length - 1) {
            console.log('\n[SYSTEM] All rows in file processed. Incrementing dates for the next cycle.');
            incrementExcelDates(EXCEL_FILE);
            
            // Wipe the state clean
            state.lastProcessedIndex = -1;
            fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        } else {
            console.log(`\n[SYSTEM] Execution paused/stopped. Next run will resume at Row ${state.lastProcessedIndex + 2}. Dates were NOT incremented.`);
        }
    });
});