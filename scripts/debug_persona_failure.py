"""
Debug script to investigate persona generation failure
Usage: python scripts/debug_persona_failure.py <user_id>
"""
import sys
import requests
import json
from datetime import datetime

# Configuration
BACKEND_URL = "https://twoconnectv1-backend.onrender.com/api/v1"
AI_SERVICE_URL = "https://twoconnectv1-ai.onrender.com/api/v1"
ADMIN_EMAIL = "admin@example.com"  # Replace
ADMIN_PASSWORD = "your_password"  # Replace

def login():
    """Get admin JWT token"""
    response = requests.post(
        f"{BACKEND_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json()['result']['access_token']
    else:
        print(f"Login failed: {response.text}")
        sys.exit(1)

def check_user_backend(token, user_id):
    """Check user in PostgreSQL/Supabase"""
    print("\n" + "="*80)
    print("CHECKING BACKEND (PostgreSQL)")
    print("="*80)

    headers = {"Authorization": f"Bearer {token}"}

    # Get user details
    response = requests.get(
        f"{BACKEND_URL}/admin/users/{user_id}",
        headers=headers
    )

    if response.status_code == 200:
        user = response.json()['result']
        print(f"\n✅ User found in backend:")
        print(f"  Email: {user.get('email')}")
        print(f"  Name: {user.get('first_name')} {user.get('last_name')}")
        print(f"  Onboarding Status: {user.get('onboarding_status')}")
        print(f"  Created: {user.get('created_at')}")

        # Check AI summary
        if user.get('summary'):
            summary = user['summary']
            print(f"\n  AI Summary:")
            print(f"    Status: {summary.get('status')}")
            print(f"    Webhook: {summary.get('webhook')}")
            print(f"    Version: {summary.get('version')}")
            print(f"    Created: {summary.get('created_at')}")

            # Check if summary content exists
            if summary.get('summary'):
                try:
                    summary_content = json.loads(summary['summary'])
                    print(f"    Content: {len(str(summary_content))} characters")
                except:
                    print(f"    Content: Unable to parse")
            else:
                print(f"    ⚠️ No summary content")
        else:
            print(f"\n  ❌ No AI summary found")

        # Check documents
        if user.get('documents'):
            print(f"\n  Documents ({len(user['documents'])}):")
            for doc in user['documents']:
                print(f"    - {doc.get('document_type')}: {doc.get('document_name')}")
        else:
            print(f"\n  ⚠️ No documents uploaded")

        return user
    else:
        print(f"❌ User not found in backend: {response.status_code}")
        print(f"Response: {response.text}")
        return None

def check_persona_status(user_id):
    """Check persona in DynamoDB via AI service"""
    print("\n" + "="*80)
    print("CHECKING AI SERVICE (DynamoDB)")
    print("="*80)

    # Note: This endpoint requires API key
    # You'll need to add it to the webhook endpoints
    print("\n⚠️ Need to implement AI service health check endpoint")
    print("Current status: Cannot directly query DynamoDB from here")
    print("\nRecommendation: Check Render logs for AI service")

def check_celery_logs(user_id):
    """Check Celery worker logs"""
    print("\n" + "="*80)
    print("CELERY LOGS CHECK")
    print("="*80)

    print("\n📋 To check Celery logs:")
    print(f"1. Go to Render Dashboard: https://dashboard.render.com/")
    print(f"2. Select 'reciprocity-ai' service")
    print(f"3. Click 'Logs' tab")
    print(f"4. Search for: {user_id}")
    print(f"5. Look for errors containing:")
    print(f"   - 'Failed to generate persona'")
    print(f"   - 'Error generating persona'")
    print(f"   - 'Missing fields'")
    print(f"   - 'No data provided'")

def diagnose_failure(user):
    """Diagnose why persona generation might have failed"""
    print("\n" + "="*80)
    print("FAILURE DIAGNOSIS")
    print("="*80)

    issues = []

    # Check onboarding
    if user.get('onboarding_status') != 'completed':
        issues.append(f"⚠️ Onboarding not completed: {user.get('onboarding_status')}")

    # Check documents
    if not user.get('documents'):
        issues.append("⚠️ No resume/documents uploaded")

    # Check summary
    if not user.get('summary'):
        issues.append("❌ No summary record exists")
    elif not user['summary'].get('webhook'):
        issues.append("⚠️ Webhook flag not set (webhook: null/false)")

    if issues:
        print("\n🔍 Potential Issues:")
        for issue in issues:
            print(f"  {issue}")
    else:
        print("\n✅ No obvious issues found in backend data")
        print("   → Check AI service logs for detailed error")

    print("\n💡 Common Causes:")
    print("  1. AI returned incomplete persona (missing required fields)")
    print("  2. No questions answered during onboarding")
    print("  3. LLM API error/timeout")
    print("  4. Missing ANTHROPIC_API_KEY in AI service")
    print("  5. Invalid response format from AI")

    print("\n🔧 Next Steps:")
    print("  1. Check Render logs for AI service (search for user ID)")
    print("  2. Check Sentry for full stack trace")
    print("  3. Verify ANTHROPIC_API_KEY is set in AI service env vars")
    print("  4. Try regenerating persona for this user")

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/debug_persona_failure.py <user_id>")
        print("Example: python scripts/debug_persona_failure.py 87673b59-f0d0-4849-8d63-632a792dc6ab")
        sys.exit(1)

    user_id = sys.argv[1]

    print(f"\n🔍 Debugging Persona Failure for User: {user_id}")
    print(f"Timestamp: {datetime.now().isoformat()}\n")

    # Login
    print("🔐 Logging in as admin...")
    token = login()
    print("✅ Login successful\n")

    # Check backend
    user = check_user_backend(token, user_id)

    if user:
        # Check AI service (via logs)
        check_persona_status(user_id)

        # Check Celery
        check_celery_logs(user_id)

        # Diagnose
        diagnose_failure(user)

    print("\n" + "="*80)
    print("DEBUG COMPLETE")
    print("="*80)

if __name__ == "__main__":
    main()
