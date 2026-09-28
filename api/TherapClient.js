import { parseDate, addDays, formatDate } from '../utils/dateHelper.js';

export class TherapClient {
  /**
   * @param {import('@playwright/test').APIRequestContext} requestContext 
   * @param {string} baseUrl 
   */
  constructor(requestContext, baseUrl) {
    this.request = requestContext;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.authToken = null;
    this.providerCode = null;
  }

  /**
   * Performs dual-protocol authentication:
   * 1. Bearer Token via /therap-api/v1/login (for attendance input)
   * 2. Session Cookies via /auth/api/v1/login (for attendance verification & delete)
   * 
   * @param {{ loginName: string, password: string, providerCode: string }} credentials 
   */
  async authenticate(credentials) {
    this.providerCode = credentials.providerCode;

    const authForm = {
      loginName: credentials.loginName,
      password: credentials.password,
      providerCode: credentials.providerCode,
      maxInactiveMinutes: "30",
      cookieEnabled: "true"
    };

    // Step A: Fetch Bearer Token
    const tokenResponse = await this.request.post(`${this.baseUrl}/therap-api/v1/login`, {
      form: authForm,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    if (tokenResponse.status() !== 200) {
      const errorText = await tokenResponse.text().catch(() => 'N/A');
      throw new Error(`API Token Authentication Failed [${tokenResponse.status()}]: ${errorText}`);
    }

    const tokenResult = await tokenResponse.json();
    this.authToken = `Bearer ${tokenResult.Token}`;

    // Step B: Establish Session Cookies
    const cookieResponse = await this.request.post(`${this.baseUrl}/auth/api/v1/login`, {
      form: authForm,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "RequestSource": "iOS"
      }
    });

    if (cookieResponse.status() !== 200) {
      const errorText = await cookieResponse.text().catch(() => 'N/A');
      throw new Error(`Session Cookie Authentication Failed [${cookieResponse.status()}]: ${errorText}`);
    }
  }

  /**
   * Common request headers
   */
  getCommonHeaders() {
    return {
      "Authorization": this.authToken,
      "Accept": "application/json",
      "RequestSource": "iOS",
      "Provider-Code": this.providerCode,
      "X-Provider": this.providerCode
    };
  }

  /**
   * Submits an attendance record (POST /therap-api/v1/attendance/inputData)
   * @param {Object} dataPayload 
   */
  async submitAttendance(dataPayload) {
    return await this.request.post(`${this.baseUrl}/therap-api/v1/attendance/inputData`, {
      data: dataPayload,
      headers: {
        ...this.getCommonHeaders(),
        "Content-Type": "application/json"
      }
    });
  }

  /**
   * Submits attendance with automatic date collision resolution.
   * If a date was already used in the database, automatically rolls forward to an available date slot.
   * 
   * @param {Object} dataPayload 
   * @param {number} expectedOutcome 
   * @param {number} maxAttempts 
   * @returns {Promise<{ response: import('@playwright/test').APIResponse, adjustedDate: string }>}
   */
  async submitAttendanceWithAutoSlot(dataPayload, expectedOutcome = 200, maxAttempts = 10) {
    let payload = { ...dataPayload };
    let currentDate = payload.serviceDate;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      payload.serviceDate = currentDate;
      const response = await this.submitAttendance(payload);

      // If success or if this is an expected negative test, return immediately
      if (response.status() === 200 || expectedOutcome >= 400) {
        return { response, adjustedDate: currentDate };
      }

      // Check if failure is specifically a date duplicate collision
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = JSON.stringify(errorBody);
      const isDateCollision = errorMsg.includes("Attendance already exists") || errorMsg.includes("already been entered");

      if (isDateCollision && expectedOutcome === 200) {
        // Jump to today + attempt offset to find an available slot
        const base = new Date();
        const candidate = addDays(base, attempt - 1);
        currentDate = formatDate(candidate);
        console.warn(`[DATE COLLISION] ${payload.serviceDate} already used. Auto-advancing to ${currentDate} (Attempt ${attempt}/${maxAttempts})`);
        continue;
      }

      // If it's another error, return response immediately for assertion evaluation
      return { response, adjustedDate: currentDate };
    }

    return { response: await this.submitAttendance(payload), adjustedDate: currentDate };
  }

  /**
   * Verifies attendance record existence via GET /api/v1/attendances/{formId}
   * @param {string} formId 
   */
  async verifyAttendance(formId) {
    return await this.request.get(`${this.baseUrl}/api/v1/attendances/${formId}`, {
      headers: this.getCommonHeaders()
    });
  }

  /**
   * Soft-deletes an attendance record (POST /api/v1/attendances/{formId})
   * Frees up the (serviceFormId, serviceDate) slot in the database for future runs.
   * 
   * @param {string} formId 
   * @param {number} version 
   */
  async deleteAttendance(formId, version = 0) {
    return await this.request.post(`${this.baseUrl}/api/v1/attendances/${formId}`, {
      data: {
        action: "DELETE",
        version: version
      },
      headers: {
        ...this.getCommonHeaders(),
        "Content-Type": "application/json"
      }
    });
  }
}