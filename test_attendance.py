import asyncio
from playwright.async_api import async_playwright

# --- CONFIGURATION SECTION ---
# Update these values based on your current environment
BASE_URL = "https://adyelullahil.therapdev.net"
ENDPOINT = "/therap-api/v1/attendance/inputData"
# Replace [Token] with your actual Bearer Token from the login API
AUTH_TOKEN = "Bearer df8e5b9f185e93c14e5eca8a7124e1691239f7ea435a584b8dd6389100902583d418cd599b"

# The data we want to send to Therap (from your API Spec)
ATTENDANCE_PAYLOAD = {
    "serviceDate": "05/09/2026",
    "timeInOut": [
        {
            "timeIn": "12:11 AM", 
            "timeOut": "12:15 PM"
        }
    ],
    "optionCode": "P",
    "status": "APPROVED",
    "serviceFormId": "BS-MIRNY-Q6P4N5XGUMULE",
    "comments": "SAMPLE ATTENDANCE CMT"
}

async def run_attendance_audit():
    # Start Playwright
    async with async_playwright() as p:
        
        # 1. Create a "Request Context" - This is like opening a communication channel
        # We add our Authentication Token and Headers here once
        request_context = await p.request.new_context(
            base_url=BASE_URL,
            # This tells Playwright to ignore local proxy settings
            proxy={"server": "per-context"} if False else None, 
            extra_http_headers={
                "Authorization": AUTH_TOKEN,
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        )

        print(f"🚀 Sending Attendance Data to: {ENDPOINT}...")

        # 2. Execute the POST request
        # We send our 'ATTENDANCE_PAYLOAD' to the server
        response = await request_context.post(ENDPOINT, data=ATTENDANCE_PAYLOAD)

        # 3. START AUDITING THE RESPONSE
        
        # Check if the status code is 200 OK [cite: 125, 131]
        if response.status == 200:
            result = await response.json()
            
            # Audit Success: Verify the response contains 'formId' [cite: 126]
            if "formId" in result:
                print("✅ AUDIT SUCCESS!")
                print(f"   Record Created. Form ID: {result['formId']}")
            else:
                print("⚠️  AUDIT WARNING: Status 200 received, but 'formId' is missing.")
                print(f"   Response Body: {result}")
        
        else:
            # Audit Failure: Catching and printing error messages 
            print(f"🛑 AUDIT FAILURE: Server returned Status {response.status}")
            
            try:
                error_data = await response.json()
                # Get the specific error message defined in your API Spec [cite: 128, 131]
                error_msg = error_data.get("formattedErrorMessage", "No specific error message provided.")
                print(f"   Error Reason: {error_msg}")
            except:
                # If the response isn't JSON, print the raw text
                print(f"   Raw Server Response: {await response.text()}")

        # Clean up the communication channel
        await request_context.dispose()

# Run the script
if __name__ == "__main__":
    asyncio.run(run_attendance_audit())