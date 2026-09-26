# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\attendance.spec.js >> Bulk Attendance API Audit (Controller Pattern)
- Location: tests\attendance.spec.js:13:1

# Error details

```
Error: POST failed for row 1

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 422
```

```
Error: POST failed for row 2

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 422
```

```
Error: POST failed for row 3

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 4

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 6

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 7

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 8

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 9

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 10

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 11

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 12

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 13

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 14

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 15

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

```
Error: POST failed for row 16

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 422
```

# Test source

```ts
  1   | import { test, expect, request } from '@playwright/test';
  2   | import fs from 'fs';
  3   | import { getExcelData, sanitizeText, incrementExcelDates } from '../utils/excelReader.js';
  4   | import { TherapClient } from '../api/TherapClient.js';
  5   | 
  6   | const BASE_URL = "https://sadat.therapdev.net";
  7   | // Changed to the new data file name we created
  8   | const EXCEL_FILE = "attendance_data.xlsx"; 
  9   | const STATE_FILE = "execution_state.json"; 
  10  | 
  11  | const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  12  | 
  13  | test('Bulk Attendance API Audit (Controller Pattern)', async () => {
  14  |     
  15  |     // Disable timeout so the 60-second waits don't kill the test
  16  |     test.setTimeout(0); 
  17  | 
  18  |     // 1. Load Execution State
  19  |     let state = { lastProcessedIndex: -1 };
  20  |     if (fs.existsSync(STATE_FILE)) {
  21  |         state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  22  |     }
  23  |     
  24  |     // 2. Initialize Data and API Client
  25  |     const { loginCredentials, rows } = getExcelData(EXCEL_FILE);
  26  |     const sessionContext = await request.newContext({ baseURL: BASE_URL });
  27  |     const api = new TherapClient(sessionContext, BASE_URL);
  28  | 
  29  |     // Calculate where to start this run
  30  |     let startIndex = state.lastProcessedIndex + 1;
  31  |     
  32  |     // Failsafe: Reset state if we somehow go out of bounds
  33  |     if (startIndex >= rows.length) {
  34  |         startIndex = 0;
  35  |         state.lastProcessedIndex = -1;
  36  |     }
  37  | 
  38  |     if (startIndex > 0) {
  39  |         console.log(`\n[SYSTEM] Resuming execution from Row ${startIndex + 1}...`);
  40  |     }
  41  | 
  42  |     // 3. Authenticate
  43  |     await test.step('Authenticate & Establish Session', async () => {
  44  |         await api.authenticate(loginCredentials);
  45  |     });
  46  | 
  47  |     // 4. Process Rows
  48  |     for (let index = startIndex; index < rows.length; index++) {
  49  |         const row = rows[index];
  50  |         
  51  |         if (!row.serviceDate) {
  52  |             state.lastProcessedIndex = index;
  53  |             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  54  |             continue;
  55  |         }
  56  | 
  57  |         // Format Date
  58  |         let formattedDate = typeof row.serviceDate === 'number' 
  59  |             ? new Date(Date.UTC(0, 0, row.serviceDate - 1)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
  60  |             : String(row.serviceDate).split(" ")[0];
  61  | 
  62  |         // --- NEW PAYLOAD CONSTRUCTION ---
  63  |         const dataPayload = {
  64  |             serviceDate: formattedDate,
  65  |             optionCode: row.optionCode ? String(row.optionCode).trim() : "",
  66  |             status: row.status ? String(row.status).trim().toUpperCase() : "INPREP",
  67  |             serviceFormId: sanitizeText(row.serviceFormId),
  68  |             comments: sanitizeText(row.comments)
  69  |         };
  70  | 
  71  |         // Conditionally attach Direct Units if cell has a value
  72  |         if (row.directBillingUnits !== undefined && row.directBillingUnits !== "") {
  73  |             dataPayload.directBillingUnits = String(row.directBillingUnits).trim();
  74  |         }
  75  | 
  76  |         // Conditionally attach Time In/Out if cells have values
  77  |         if (row.timeIn && row.timeOut) {
  78  |             dataPayload.timeInOut = [{ 
  79  |                 timeIn: sanitizeText(row.timeIn), 
  80  |                 timeOut: sanitizeText(row.timeOut) 
  81  |             }];
  82  |         }
  83  |         // ---------------------------------
  84  | 
  85  |         await test.step(`Process Row ${index + 1}: Date ${dataPayload.serviceDate}`, async () => {
  86  |             // POST Request
  87  |             const postResponse = await api.submitAttendance(dataPayload);
  88  |             
  89  |             // Expected outcome check for Negative Testing
  90  |             // (Defaults to 200 for old files, uses 'Expected Outcome' column for the new file)
  91  |             const expectedStatus = parseInt(row['Expected Outcome']) || 200;
  92  |             
  93  |             if (postResponse.status() !== expectedStatus) {
  94  |                 const errorBody = await postResponse.json().catch(() => ({ error: 'Unparseable JSON' }));
  95  |                 console.log(`\n[FAILED] Row ${index + 1} API Error:`, errorBody);
  96  |                 
  97  |                 // Mark this row as processed so we don't get stuck in an infinite retry loop tomorrow
  98  |                 state.lastProcessedIndex = index;
  99  |                 fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  100 |                 
> 101 |                 expect.soft(postResponse.status(), `POST failed for row ${index + 1}`).toBe(expectedStatus);
      |                                                                                        ^ Error: POST failed for row 16
  102 |                 return; 
  103 |             }
  104 | 
  105 |             // --- SKIP VERIFICATION FOR NEGATIVE TESTS ---
  106 |             // If we EXPECTED a 400 error and got it, we consider it a success and move to the next row.
  107 |             // There is no formId to verify if it failed intentionally!
  108 |             if (expectedStatus >= 400) {
  109 |                 console.log(`[SUCCESS] Negative Test Passed for Row ${index + 1}. Expected ${expectedStatus} received.`);
  110 |                 state.lastProcessedIndex = index;
  111 |                 fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  112 |                 return;
  113 |             }
  114 | 
  115 |             const result = await postResponse.json();
  116 |             const newFormId = result.formId;
  117 | 
  118 |             // Wait for DB replication
  119 |             // await delay(60000); 
  120 | 
  121 |             // GET Request (Verification)
  122 |             const verifyResponse = await api.verifyAttendance(newFormId);
  123 |             
  124 |             if (verifyResponse.status() !== 200) {
  125 |                 const errorText = await verifyResponse.text();
  126 |                 console.log(`\n[GET ERROR DETAILS] Row ${index + 1} | Status: ${verifyResponse.status()} | Body:`, errorText);
  127 |             }
  128 | 
  129 |             expect(verifyResponse.status(), 'GET verification should succeed').toBe(200);
  130 | 
  131 |             const verifyData = await verifyResponse.json();
  132 |             expect(verifyData.attendanceStatus).toBeDefined();
  133 |             
  134 |             // Save State upon full success
  135 |             state.lastProcessedIndex = index;
  136 |             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  137 |             
  138 |             // --- SUCCESS LOGGING ---
  139 |             console.log(`[SUCCESS] Row ${index + 1} created and verified successfully!`);
  140 |         });
  141 |     }
  142 | 
  143 |     // 5. Teardown & Data Rotation (Write-Back)
  144 |     await test.step('Cleanup and Rotate Test Data', async () => {
  145 |         await sessionContext.dispose();
  146 |         
  147 |         if (state.lastProcessedIndex >= rows.length - 1) {
  148 |             console.log('\n[SYSTEM] All rows in file processed. Incrementing dates for the next cycle.');
  149 |             incrementExcelDates(EXCEL_FILE);
  150 |             
  151 |             // Wipe the state clean
  152 |             state.lastProcessedIndex = -1;
  153 |             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  154 |         } else {
  155 |             console.log(`\n[SYSTEM] Execution paused/stopped. Next run will resume at Row ${state.lastProcessedIndex + 2}. Dates were NOT incremented.`);
  156 |         }
  157 |     });
  158 | });
```