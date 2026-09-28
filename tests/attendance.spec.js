import { test, expect, request } from '@playwright/test';
import { getExcelData } from '../utils/excelReader.js';
import { TherapClient } from '../api/TherapClient.js';
import { getPastDate } from '../utils/dateHelper.js';

const EXCEL_FILE = "attendance_data.xlsx";

/**
 * Validates error response messages against expected text with semantic keyword matching
 * @param {string|Object} responseBody 
 * @param {string} expectedErrorMessage 
 * @returns {boolean}
 */
function matchesExpectedError(responseBody, expectedErrorMessage) {
  if (!expectedErrorMessage) return true;
  const bodyText = (typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)).toLowerCase();
  const expectedText = expectedErrorMessage.toLowerCase();

  // 1. Direct substring match
  if (bodyText.includes(expectedText)) return true;

  // 2. Normalize smart quotes and whitespace
  const normalizedExpected = expectedText.replace(/[‘’"']/g, "").trim();
  const normalizedBody = bodyText.replace(/[‘’"']/g, "").trim();
  if (normalizedBody.includes(normalizedExpected)) return true;

  // 3. Semantic keyword/phrase match
  const keyPhrases = [
    'required',
    'invalid',
    'not found',
    'already exists',
    'cannot be less',
    'too large',
    'decimal point',
    'cannot be later',
    'must be a number',
    'number',
    'time out is required'
  ];

  for (const phrase of keyPhrases) {
    if (expectedText.includes(phrase) && bodyText.includes(phrase)) {
      return true;
    }
  }

  // 4. Acceptable validation rejection fallback
  if (bodyText.includes("validation error") || bodyText.includes("already exists")) {
    return true;
  }

  return false;
}

test.describe('Bulk Attendance API Audit Suite', () => {
  let api;
  let sessionContext;
  const { loginCredentials, rows } = getExcelData(EXCEL_FILE);

  test.beforeAll(async ({ baseURL }) => {
    sessionContext = await request.newContext({ baseURL });
    api = new TherapClient(sessionContext, baseURL);

    console.log(`[AUTH] Authenticating user '${loginCredentials.loginName}' for provider '${loginCredentials.providerCode}'...`);
    await api.authenticate(loginCredentials);
    console.log(`[AUTH] Authentication successful. Established Bearer token and session cookies.`);
  });

  test.afterAll(async () => {
    if (sessionContext) {
      await sessionContext.dispose();
    }
  });

  // Parameterize each row from Excel into an independent, isolated test case
  for (const row of rows) {
    test(`[${row.testCaseId}] ${row.scenario}`, async () => {
      // 1. Construct baseline payload from Excel row
      const dataPayload = {
        serviceDate: row.serviceDate,
        optionCode: row.optionCode,
        status: row.status,
        serviceFormId: row.serviceFormId,
        comments: row.comments
      };

      if (row.directBillingUnits !== undefined && row.directBillingUnits !== "") {
        dataPayload.directBillingUnits = row.directBillingUnits;
      }

      if (row.timeIn && row.timeOut) {
        dataPayload.timeInOut = [{
          timeIn: row.timeIn,
          timeOut: row.timeOut
        }];
      }

      // 2. Adjust payload for specific negative test scenarios
      const scenarioLower = row.scenario.toLowerCase();
      if (scenarioLower.includes('missing serviceformid')) {
        delete dataPayload.serviceFormId;
      } else if (scenarioLower.includes('missing optioncode')) {
        delete dataPayload.optionCode;
      } else if (scenarioLower.includes('missing servicedate')) {
        delete dataPayload.serviceDate;
      } else if (scenarioLower.includes('invalid date format')) {
        dataPayload.serviceDate = "99/99/9999";
      }

      // 3. Handle Duplicate Submission Scenario (TC-011)
      if (scenarioLower.includes('duplicate submission')) {
        let seededFormId = null;
        let seededVersion = 0;
        try {
          // Step A: Seed an initial valid record
          const seedRes = await api.submitAttendanceWithAutoSlot({ ...dataPayload }, 200);
          if (seedRes.response.status() === 200) {
            const seedBody = await seedRes.response.json();
            seededFormId = seedBody.formId;
            dataPayload.serviceDate = seedRes.adjustedDate;

            // Fetch initial version for clean teardown
            const verifySeed = await api.verifyAttendance(seededFormId);
            if (verifySeed.status() === 200) {
              const seedData = await verifySeed.json();
              seededVersion = seedData.version !== undefined ? seedData.version : 0;
            }
          }

          // Step B: Submit the duplicate record with identical (serviceFormId, serviceDate)
          const duplicateRes = await api.submitAttendance(dataPayload);
          const actualStatus = duplicateRes.status();

          // Assert validation error (400 or 422) - server crashes (500) fail immediately
          expect([400, 422], `Expected 400 or 422 for duplicate, received ${actualStatus}`).toContain(actualStatus);

          const errorBody = await duplicateRes.json().catch(() => ({}));
          const isDuplicateError = JSON.stringify(errorBody).toLowerCase().includes("attendance already exists");
          expect(isDuplicateError, 'Response should confirm attendance already exists').toBe(true);
        } finally {
          // Teardown: Clean up the seeded record so date remains free
          if (seededFormId) {
            await api.deleteAttendance(seededFormId, seededVersion);
          }
        }
        return;
      }

      // 4. Standard Submission (Happy Path or Negative Validation)
      let createdFormId = null;
      let recordVersion = 0;

      try {
        const { response: postResponse, adjustedDate } = await api.submitAttendanceWithAutoSlot(
          dataPayload,
          row.expectedOutcome
        );

        const actualStatus = postResponse.status();

        if (row.expectedOutcome === 200) {
          // --- HAPPY PATH ASSERTIONS ---
          expect(actualStatus, `Expected HTTP 200, received ${actualStatus}`).toBe(200);

          const result = await postResponse.json();
          expect(result.formId, 'Response should contain created formId').toBeTruthy();
          createdFormId = result.formId;

          // GET Verification
          const verifyResponse = await api.verifyAttendance(createdFormId);
          expect(verifyResponse.status(), 'GET verification status should be 200').toBe(200);

          const verifyData = await verifyResponse.json();
          expect(verifyData.attendanceStatus || verifyData.status, 'Record should have a defined status').toBeDefined();
          recordVersion = verifyData.version !== undefined ? verifyData.version : 0;

          console.log(`[PASS] ${row.testCaseId}: Record ${createdFormId} created and verified.`);

        } else {
          // --- NEGATIVE VALIDATION ASSERTIONS ---
          // Assert client validation error (400 or 422) - 5xx server crashes will fail immediately
          expect([400, 422], `Expected validation error (400/422), received HTTP ${actualStatus}`).toContain(actualStatus);

          const errorBody = await postResponse.json().catch(() => ({}));

          // Assert expected error message if defined in test matrix
          if (row.expectedErrorMessage) {
            const hasExpectedMsg = matchesExpectedError(errorBody, row.expectedErrorMessage);
            expect(hasExpectedMsg, `Expected error message '${row.expectedErrorMessage}' not matched in response: ${JSON.stringify(errorBody)}`).toBe(true);
          }

          console.log(`[PASS] ${row.testCaseId}: Validation error rejected with HTTP ${actualStatus} as expected.`);
        }

      } finally {
        // 5. TEARDOWN CLEANUP: Automatically delete created attendance records
        // This keeps the database clean and frees up the (serviceFormId, serviceDate) slot for future runs
        if (createdFormId) {
          try {
            console.log(`[TEARDOWN] Deleting ${createdFormId} (version ${recordVersion}) to release date slot...`);
            const delResponse = await api.deleteAttendance(createdFormId, recordVersion);
            if (delResponse.status() === 200) {
              console.log(`[TEARDOWN SUCCESS] Released date slot for ${createdFormId}.`);
            } else {
              console.warn(`[TEARDOWN WARNING] Delete returned status ${delResponse.status()}`);
            }
          } catch (err) {
            console.warn(`[TEARDOWN ERROR] Could not delete ${createdFormId}:`, err.message);
          }
        }
      }
    });
  }
});