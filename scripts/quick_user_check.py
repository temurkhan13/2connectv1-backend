"""
Quick User Diagnostic - No Admin Login Required
-----------------------------------------------
Checks user status by calling public/less-restricted endpoints
"""
import requests
import sys

# User email from command line
if len(sys.argv) < 2:
    print("Usage: python scripts/quick_user_check.py <email>")
    sys.exit(1)

email = sys.argv[1]
user_id = "87673b59-f0d0-4849-8d63-632a792dc6ab"  # ryan@stbl.io

print(f"\n{'='*80}")
print(f"QUICK USER DIAGNOSTIC: {email}")
print(f"{'='*80}\n")

# 1. Check system health (no auth required)
print("1. SYSTEM HEALTH CHECK")
print("-" * 80)
try:
    response = requests.get("https://twoconnectv1-backend.onrender.com/api/v1/dashboard/admin/system-health")
    if response.status_code == 200:
        data = response.json()
        print(f"Overall Status: {data['result']['overall_status']}")
        if 'error' in data['result']:
            print(f"ERROR: {data['result']['error']}")
    else:
        print(f"ERROR: Could not fetch system health (status {response.status_code})")
except Exception as e:
    print(f"ERROR: {e}")

# 2. Check AI service health
print(f"\n2. AI SERVICE HEALTH")
print("-" * 80)
try:
    response = requests.get("https://twoconnectv1-ai.onrender.com/api/v1/health")
    if response.status_code == 200:
        data = response.json()
        print(f"AI Service Status: {data['data']['status']}")
    else:
        print(f"ERROR: AI service returned {response.status_code}")
except Exception as e:
    print(f"ERROR: {e}")

# 3. Try to get user persona from AI service (if endpoint is public)
print(f"\n3. USER PERSONA CHECK")
print("-" * 80)
print(f"User ID: {user_id}")
print(f"Email: {email}")
print("\nNote: Cannot check persona without API key.")
print("Persona generation happens via Celery task triggered by onboarding completion.")
print("\nPossible failure reasons:")
print("  1. AI returned incomplete persona (missing required fields)")
print("  2. No user data (no onboarding answers or resume)")
print("  3. LLM API error (timeout, rate limit, API failure)")
print("  4. Missing ANTHROPIC_API_KEY in AI service")

# 4. Check if we can access Render logs
print(f"\n4. NEXT STEPS")
print("-" * 80)
print("To investigate further:")
print("  1. Check Render AI service logs:")
print("     - Go to https://dashboard.render.com/")
print("     - Select 'reciprocity-ai' service")
print("     - Click 'Logs' tab")
print(f"     - Search for: {user_id} or {email}")
print("")
print("  2. Check Sentry for full error:")
print("     - Go to Sentry dashboard")
print("     - Find error at '/api/v1/admin/regenerate-embeddings'")
print("     - Look for stack trace with 'Persona generation failed'")
print("")
print("  3. Use admin monitoring script (requires credentials):")
print(f"     python scripts/monitor_users.py --user {email}")
print("")
print("  4. Check if user completed onboarding:")
print("     - Login to admin dashboard")
print("     - Check user's onboarding_status field")
print("     - Verify user has answered questions and uploaded resume")

print(f"\n{'='*80}\n")
