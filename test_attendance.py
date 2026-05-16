import asyncio
import pandas as pd
from playwright.async_api import async_playwright

# 1. Base Project Settings
BASE_URL = "https://adyelullahil.therapdev.net"
LOGIN_ENDPOINT = "/therap-api/v1/login"
ATTENDANCE_ENDPOINT = "/therap-api/v1/attendance/inputData"
EXCEL_FILE = "attendance_data.xlsx"

async def run_bulk_attendance_audit():
    # Load the credentials and test data sheets from your Excel file
    print(f"📂 Reading workbook configurations from {EXCEL_FILE}...")
    
    # Read the Credentials sheet and extract the values
    cred_df = pd.read_excel(EXCEL_FILE, sheet_name="Credentials")
    login_credentials = {
        "loginName": str(cred_df.loc[0, "loginName"]),
        "providerCode": str(cred_df.loc[0, "providerCode"]),
        "password": str(cred_df.loc[0, "password"])
    }
    
    # Read the main test cases sheet
    df = pd.read_excel(EXCEL_FILE, sheet_name="AuditData")

    async with async_playwright() as p:
        
        # Step 1: Create a baseline context and request a fresh token
        print("🔐 Requesting a fresh Bearer Token from the login endpoint...")
        login_context = await p.request.new_context(base_url=BASE_URL)
        
        login_response = await login_context.post(
            LOGIN_ENDPOINT,
            form=login_credentials,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        if login_response.status != 200:
            print(f"🛑 LOGIN FAILED (Status {login_response.status}). Check credentials inside Excel.")
            print(f"Server response: {await login_response.text()}")
            await login_context.dispose()
            return

        # Extract the security key from the server response
        login_result = await login_response.json()
        raw_token = login_result.get("Token")
        auth_token = f"Bearer {raw_token}"
        print("🔑 Fresh Token retrieved successfully and saved to memory!")
        await login_context.dispose()

        # Step 2: Establish a secure session using the newly retrieved token
        secure_context = await p.request.new_context(
            base_url=BASE_URL,
            extra_http_headers={
                "Authorization": auth_token,
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        )

        # Step 3: Loop through each row of the Excel sheet and submit the data
        for index, row in df.iterrows():
            payload = {
                "serviceDate": str(row['serviceDate']),
                "timeInOut": [{
                    "timeIn": str(row['timeIn']),
                    "timeOut": str(row['timeOut'])
                }],
                "optionCode": str(row['optionCode']),
                "status": str(row['status']),
                "serviceFormId": str(row['serviceFormId']),
                "comments": str(row['comments'])
            }

            print(f"🚀 [Row {index+1}] Auditing Attendance for {payload['serviceDate']}...")
            response = await secure_context.post(ATTENDANCE_ENDPOINT, data=payload)

            # Step 4: Evaluate the server response for this specific row
            if response.status == 200:
                result = await response.json()
                print(f"   ✅ SUCCESS: Form ID {result.get('formId')}")
            else:
                try:
                    error_json = await response.json()
                    error_msg = error_json.get("formattedErrorMessage", "Unknown Error")
                    print(f"   🛑 FAILED (Status {response.status}): {error_msg}")
                except:
                    print(f"   🛑 FAILED: Server returned Status {response.status}")

        # Step 5: Clean up and close the communication channel
        await secure_context.dispose()

if __name__ == "__main__":
    asyncio.run(run_bulk_attendance_audit())