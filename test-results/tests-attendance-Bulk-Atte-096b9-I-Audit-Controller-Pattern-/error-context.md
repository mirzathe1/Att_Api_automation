# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\attendance.spec.js >> Bulk Attendance API Audit (Controller Pattern)
- Location: tests\attendance.spec.js:12:1

# Error details

```
Error: POST failed for row 1

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 422
```

# Test source

```ts
  8   | const STATE_FILE = "execution_state.json"; 
  9   | 
  10  | const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  11  | 
  12  | test('Bulk Attendance API Audit (Controller Pattern)', async () => {
  13  |     
  14  |     // Disable timeout so the 60-second waits don't kill the test
  15  |     test.setTimeout(0); 
  16  | 
  17  |     // 1. Load Execution State
  18  |     let state = { lastProcessedIndex: -1 };
  19  |     if (fs.existsSync(STATE_FILE)) {
  20  |         state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  21  |     }
  22  |     
  23  |     // 2. Initialize Data and API Client
  24  |     const { loginCredentials, rows } = getExcelData(EXCEL_FILE);
  25  |     const sessionContext = await request.newContext({ baseURL: BASE_URL });
  26  |     const api = new TherapClient(sessionContext, BASE_URL);
  27  | 
  28  |     // Calculate where to start this run
  29  |     let startIndex = state.lastProcessedIndex + 1;
  30  |     
  31  |     // Failsafe: Reset state if we somehow go out of bounds
  32  |     if (startIndex >= rows.length) {
  33  |         startIndex = 0;
  34  |         state.lastProcessedIndex = -1;
  35  |     }
  36  | 
  37  |     if (startIndex > 0) {
  38  |         console.log(`\n[SYSTEM] Resuming execution from Row ${startIndex + 1}...`);
  39  |     }
  40  | 
  41  |     // 3. Authenticate
  42  |     await test.step('Authenticate & Establish Session', async () => {
  43  |         await api.authenticate(loginCredentials);
  44  |     });
  45  | 
  46  |     // 4. Process Rows
  47  |     for (let index = startIndex; index < rows.length; index++) {
  48  |         const row = rows[index];
  49  |         
  50  |         if (!row.serviceDate) {
  51  |             state.lastProcessedIndex = index;
  52  |             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  53  |             continue;
  54  |         }
  55  | 
  56  |         // Format Date
  57  |         let formattedDate = typeof row.serviceDate === 'number' 
  58  |             ? new Date(Date.UTC(0, 0, row.serviceDate - 1)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
  59  |             : String(row.serviceDate).split(" ")[0];
  60  | 
  61  |         const dataPayload = {
  62  |             serviceDate: formattedDate,
  63  |             optionCode: row.optionCode ? String(row.optionCode).trim() : "",
  64  |             status: row.status ? String(row.status).trim().toUpperCase() : "INPREP",
  65  |             serviceFormId: sanitizeText(row.serviceFormId),
  66  |             comments: sanitizeText(row.comments)
  67  |         };
  68  | 
  69  |         // Conditionally attach Direct Units if cell has a value
  70  |         if (row.directBillingUnits !== undefined && row.directBillingUnits !== "") {
  71  |             dataPayload.directBillingUnits = String(row.directBillingUnits).trim();
  72  |         }
  73  | 
  74  |         // Conditionally attach Time In/Out if cells have values
  75  |         if (row.timeIn && row.timeOut) {
  76  |             dataPayload.timeInOut = [{ 
  77  |                 timeIn: sanitizeText(row.timeIn), 
  78  |                 timeOut: sanitizeText(row.timeOut) 
  79  |             }];
  80  |         }
  81  | 
  82  |         await test.step(`Process Row ${index + 1}: Date ${dataPayload.serviceDate}`, async () => {
  83  |             // POST Request
  84  |             const postResponse = await api.submitAttendance(dataPayload);
  85  |             
  86  |             const expectedStatus = parseInt(row['Expected Outcome']) || 200;
  87  |             const actualStatus = postResponse.status();
  88  |             
  89  |             // Allow flexibility for validation errors (Server might return 400 or 422)
  90  |             const isExpectedNegativeTest = expectedStatus >= 400 && expectedStatus < 600;
  91  |             const didServerFail = actualStatus >= 400 && actualStatus < 600;
  92  | 
  93  |             if (isExpectedNegativeTest && didServerFail) {
  94  |                 // We expected it to fail, and it did. Test passes!
  95  |                 console.log(`[SUCCESS] Negative Test Passed for Row ${index + 1}. Expected failure, received server error: ${actualStatus}`);
  96  |                 state.lastProcessedIndex = index;
  97  |                 fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  98  |                 return;
  99  | 
  100 |             } else if (actualStatus !== expectedStatus) {
  101 |                 // Something unexpected happened (Happy path failed, OR Negative path succeeded)
  102 |                 const errorBody = await postResponse.json().catch(() => ({ error: 'Unparseable JSON' }));
  103 |                 console.log(`\n[FAILED] Row ${index + 1} | Expected: ${expectedStatus}, Received: ${actualStatus} | API Response:`, errorBody);
  104 |                 
  105 |                 state.lastProcessedIndex = index;
  106 |                 fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  107 |                 
> 108 |                 expect.soft(actualStatus, `POST failed for row ${index + 1}`).toBe(expectedStatus);
      |                                                                               ^ Error: POST failed for row 1
  109 |                 return; 
  110 |             }
  111 | 
  112 |             // --- GET VERIFICATION (Only runs if Happy Path succeeded as expected) ---
  113 |             const result = await postResponse.json();
  114 |             const newFormId = result.formId;
  115 | 
  116 |             // Wait for DB replication if needed
  117 |             // await delay(60000); 
  118 | 
  119 |             // GET Request (Verification)
  120 |             const verifyResponse = await api.verifyAttendance(newFormId);
  121 |             
  122 |             if (verifyResponse.status() !== 200) {
  123 |                 const errorText = await verifyResponse.text();
  124 |                 console.log(`\n[GET ERROR DETAILS] Row ${index + 1} | Status: ${verifyResponse.status()} | Body:`, errorText);
  125 |             }
  126 | 
  127 |             expect(verifyResponse.status(), 'GET verification should succeed').toBe(200);
  128 | 
  129 |             const verifyData = await verifyResponse.json();
  130 |             expect(verifyData.attendanceStatus).toBeDefined();
  131 |             
  132 |             // Save State upon full success
  133 |             state.lastProcessedIndex = index;
  134 |             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  135 |             
  136 |             // --- SUCCESS LOGGING ---
  137 |             console.log(`[SUCCESS] Row ${index + 1} created and verified successfully!`);
  138 |         });
  139 |     }
  140 | 
  141 |     // 5. Teardown & Data Rotation (Write-Back)
  142 |     await test.step('Cleanup and Rotate Test Data', async () => {
  143 |         await sessionContext.dispose();
  144 |         
  145 |         if (state.lastProcessedIndex >= rows.length - 1) {
  146 |             console.log('\n[SYSTEM] All rows in file processed. Incrementing dates for the next cycle.');
  147 |             incrementExcelDates(EXCEL_FILE);
  148 |             
  149 |             // Wipe the state clean
  150 |             state.lastProcessedIndex = -1;
  151 |             fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  152 |         } else {
  153 |             console.log(`\n[SYSTEM] Execution paused/stopped. Next run will resume at Row ${state.lastProcessedIndex + 2}. Dates were NOT incremented.`);
  154 |         }
  155 |     });
  156 | });
```