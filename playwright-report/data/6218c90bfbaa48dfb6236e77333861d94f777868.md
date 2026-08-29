# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\attendance.spec.js >> Bulk Attendance API Audit (Controller Pattern)
- Location: tests\attendance.spec.js:222:1

# Error details

```
Error: POST failed for row 8

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 422
```

# Test source

```ts
  195 |         
  196 | //         // --- Conditionally Increment Dates ---
  197 | //         if (state.lastProcessedIndex >= rows.length - 1) {
  198 | //             console.log('\n[SYSTEM] All rows in file processed. Incrementing dates for the next cycle.');
  199 | //             incrementExcelDates(EXCEL_FILE);
  200 |             
  201 | //             // Wipe the state clean so the next execution starts at Row 1 with new dates
  202 | //             state.lastProcessedIndex = -1;
  203 | //             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  204 | //         } else {
  205 | //             console.log(`\n[SYSTEM] Execution paused/stopped. Next run will resume at Row ${state.lastProcessedIndex + 2}. Dates were NOT incremented.`);
  206 | //         }
  207 | //     });
  208 | // });
  209 | 
  210 | 
  211 | import { test, expect, request } from '@playwright/test';
  212 | import fs from 'fs';
  213 | import { getExcelData, sanitizeText, incrementExcelDates } from '../utils/excelReader.js';
  214 | import { TherapClient } from '../api/TherapClient.js';
  215 | 
  216 | const BASE_URL = "https://billing.therapdev.net";
  217 | const EXCEL_FILE = "attendance_data.xlsx"; 
  218 | const STATE_FILE = "execution_state.json"; 
  219 | 
  220 | const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  221 | 
  222 | test('Bulk Attendance API Audit (Controller Pattern)', async () => {
  223 |     
  224 |     // Disable timeout so the 60-second waits don't kill the test
  225 |     test.setTimeout(0); 
  226 | 
  227 |     // 1. Load Execution State
  228 |     let state = { lastProcessedIndex: -1 };
  229 |     if (fs.existsSync(STATE_FILE)) {
  230 |         state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  231 |     }
  232 |     
  233 |     // 2. Initialize Data and API Client
  234 |     const { loginCredentials, rows } = getExcelData(EXCEL_FILE);
  235 |     const sessionContext = await request.newContext({ baseURL: BASE_URL });
  236 |     const api = new TherapClient(sessionContext, BASE_URL);
  237 | 
  238 |     // Calculate where to start this run
  239 |     let startIndex = state.lastProcessedIndex + 1;
  240 |     
  241 |     // Failsafe: Reset state if we somehow go out of bounds
  242 |     if (startIndex >= rows.length) {
  243 |         startIndex = 0;
  244 |         state.lastProcessedIndex = -1;
  245 |     }
  246 | 
  247 |     if (startIndex > 0) {
  248 |         console.log(`\n[SYSTEM] Resuming execution from Row ${startIndex + 1}...`);
  249 |     }
  250 | 
  251 |     // 3. Authenticate
  252 |     await test.step('Authenticate & Establish Session', async () => {
  253 |         await api.authenticate(loginCredentials);
  254 |     });
  255 | 
  256 |     // 4. Process Rows
  257 |     for (let index = startIndex; index < rows.length; index++) {
  258 |         const row = rows[index];
  259 |         
  260 |         if (!row.serviceDate) {
  261 |             state.lastProcessedIndex = index;
  262 |             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  263 |             continue;
  264 |         }
  265 | 
  266 |         // Format Date
  267 |         let formattedDate = typeof row.serviceDate === 'number' 
  268 |             ? new Date(Date.UTC(0, 0, row.serviceDate - 1)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
  269 |             : String(row.serviceDate).split(" ")[0];
  270 | 
  271 |         const dataPayload = {
  272 |             serviceDate: formattedDate,
  273 |             timeInOut: [{ timeIn: sanitizeText(row.timeIn), timeOut: sanitizeText(row.timeOut) }],
  274 |             optionCode: row.optionCode ? String(row.optionCode).trim() : "",
  275 |             status: row.status ? String(row.status).trim().toUpperCase() : "INPREP",
  276 |             serviceFormId: sanitizeText(row.serviceFormId),
  277 |             comments: sanitizeText(row.comments)
  278 |         };
  279 | 
  280 |         await test.step(`Process Row ${index + 1}: Date ${dataPayload.serviceDate}`, async () => {
  281 |             // POST Request
  282 |             const postResponse = await api.submitAttendance(dataPayload);
  283 |             
  284 |             // --- OPTION B: GRACEFUL FAILURE HANDLING ---
  285 |             if (postResponse.status() !== 200) {
  286 |                 const errorBody = await postResponse.json();
  287 |                 console.log(`\n[FAILED] Row ${index + 1} API Error:`, errorBody);
  288 |                 
  289 |                 // Mark this row as processed so we don't get stuck in an infinite retry loop tomorrow
  290 |                 state.lastProcessedIndex = index;
  291 |                 fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  292 |                 
  293 |                 // Use Playwright's soft expect to log the failure in the final HTML report, 
  294 |                 // but the 'return' statement below stops this specific step and continues the loop!
> 295 |                 expect.soft(postResponse.status(), `POST failed for row ${index + 1}`).toBe(200);
      |                                                                                        ^ Error: POST failed for row 8
  296 |                 return; 
  297 |             }
  298 | 
  299 |             const result = await postResponse.json();
  300 |             const newFormId = result.formId;
  301 | 
  302 |             // Wait for DB replication
  303 |             // await delay(60000); 
  304 | 
  305 |             // GET Request (Verification)
  306 |             const verifyResponse = await api.verifyAttendance(newFormId);
  307 |             
  308 |             if (verifyResponse.status() !== 200) {
  309 |                 const errorText = await verifyResponse.text();
  310 |                 console.log(`\n[GET ERROR DETAILS] Row ${index + 1} | Status: ${verifyResponse.status()} | Body:`, errorText);
  311 |             }
  312 | 
  313 |             expect(verifyResponse.status(), 'GET verification should succeed').toBe(200);
  314 | 
  315 |             const verifyData = await verifyResponse.json();
  316 |             expect(verifyData.attendanceStatus).toBeDefined();
  317 |             
  318 |             // Save State upon full success
  319 |             state.lastProcessedIndex = index;
  320 |             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  321 |             
  322 |             // --- SUCCESS LOGGING ---
  323 |             console.log(`[SUCCESS] Row ${index + 1} created and verified successfully!`);
  324 |         });
  325 |     }
  326 | 
  327 |     // 5. Teardown & Data Rotation (Write-Back)
  328 |     await test.step('Cleanup and Rotate Test Data', async () => {
  329 |         await sessionContext.dispose();
  330 |         
  331 |         if (state.lastProcessedIndex >= rows.length - 1) {
  332 |             console.log('\n[SYSTEM] All rows in file processed. Incrementing dates for the next cycle.');
  333 |             incrementExcelDates(EXCEL_FILE);
  334 |             
  335 |             // Wipe the state clean
  336 |             state.lastProcessedIndex = -1;
  337 |             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  338 |         } else {
  339 |             console.log(`\n[SYSTEM] Execution paused/stopped. Next run will resume at Row ${state.lastProcessedIndex + 2}. Dates were NOT incremented.`);
  340 |         }
  341 |     });
  342 | });
```