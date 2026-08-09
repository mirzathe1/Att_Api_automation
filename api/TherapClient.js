export class TherapClient {
    constructor(requestContext, baseUrl) {
        this.request = requestContext;
        this.baseUrl = baseUrl;
        this.authToken = null;
        this.providerCode = null; 
    }

    async authenticate(credentials) {
        // Capture provider code for subsequent requests
        this.providerCode = credentials.providerCode;

        // Step A: Fetch Bearer Token
        const loginResponse = await this.request.post(`${this.baseUrl}/therap-api/v1/login`, {
            form: {
                ...credentials,
                maxInactiveMinutes: "30",
                cookieEnabled: "true"
            },
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });

        if (loginResponse.status() !== 200) throw new Error("API Login Failed");
        const loginResult = await loginResponse.json();
        this.authToken = "Bearer " + loginResult.Token;

        // Step B: Establish Session Cookies
        const cookieResponse = await this.request.post(`${this.baseUrl}/auth/api/v1/login`, {
            form: {
                ...credentials,
                maxInactiveMinutes: "30",
                cookieEnabled: "true"
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "RequestSource": "iOS"
            }
        });

        if (cookieResponse.status() !== 200) throw new Error("Cookie Login Failed");
    }

    async submitAttendance(dataPayload) {
        return await this.request.post(`${this.baseUrl}/therap-api/v1/attendance/inputData`, {
            data: dataPayload,
            headers: {
                 "Authorization": this.authToken,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "RequestSource": "iOS",
                "Provider-Code": this.providerCode,
                "X-Provider": this.providerCode
            }
        });
    }

    async verifyAttendance(formId) {
        return await this.request.get(`${this.baseUrl}/api/v1/attendances/${formId}`, {
            headers: {
                 "Authorization": this.authToken,
                "Accept": "application/json",
                "RequestSource": "iOS",
                "Provider-Code": this.providerCode,
                "X-Provider": this.providerCode
            },
            timeout: 60000
        });
    }
}