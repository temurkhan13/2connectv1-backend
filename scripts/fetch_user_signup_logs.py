"""
Fetch Render AI service logs for a specific user around their signup time.
Helps diagnose persona generation failures.

Usage: python scripts/fetch_user_signup_logs.py <email>
"""
import sys
import requests
import subprocess
from datetime import datetime, timedelta

# Configuration
BACKEND_URL = "https://twoconnectv1-backend.onrender.com/api/v1"
RENDER_SERVICE_ID = "srv-cu3sqk08fa8c73a53qbg"  # reciprocity-ai service
ADMIN_EMAIL = "admin@2connect.ai"
ADMIN_PASSWORD = "Admin@2026"

def login():
    """Get admin JWT token"""
    response = requests.post(
        f"{BACKEND_URL}/auth/signin",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )

    if response.status_code == 200:
        return response.json()['result']['access_token']
    else:
        print(f"ERROR: Login failed: {response.text}")
        sys.exit(1)

def get_user_details(token, email):
    """Get user details including creation time"""
    headers = {"Authorization": f"Bearer {token}"}

    # Search for user
    response = requests.get(
        f"{BACKEND_URL}/admin/users/search",
        headers=headers,
        params={"query": email}
    )

    if response.status_code != 200:
        print(f"ERROR: Failed to search users: {response.text}")
        return None

    users = response.json()['result']
    if not users:
        print(f"ERROR: No user found with email: {email}")
        return None

    user_id = users[0]['id']

    # Get full details
    response = requests.get(
        f"{BACKEND_URL}/admin/users/{user_id}",
        headers=headers
    )

    if response.status_code == 200:
        return response.json()['result']
    else:
        print(f"ERROR: Failed to fetch user details: {response.text}")
        return None

def fetch_render_logs(user_id, created_at):
    """Fetch Render logs around the user's signup time"""
    # Parse creation time
    created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))

    # Get logs from 5 minutes before to 30 minutes after signup
    start_time = created - timedelta(minutes=5)
    end_time = created + timedelta(minutes=30)

    print(f"\nFetching logs from {start_time.isoformat()} to {end_time.isoformat()}")
    print(f"Looking for user_id: {user_id}\n")

    # Use render CLI to fetch logs
    cmd = [
        "render.exe",
        "logs",
        "-r", RENDER_SERVICE_ID,
        "-o", "text",
        "--tail", "10000"  # Get last 10,000 lines
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode != 0:
            print(f"ERROR: Render CLI failed: {result.stderr}")
            return None

        # Filter logs for this user
        logs = result.stdout
        user_logs = [line for line in logs.split('\n') if user_id in line]

        return user_logs

    except subprocess.TimeoutExpired:
        print("ERROR: Render CLI timed out")
        return None
    except FileNotFoundError:
        print("ERROR: render.exe not found. Make sure Render CLI is installed.")
        print("Install: https://dashboard.render.com/docs/cli")
        return None

def analyze_logs(user_logs, user_email):
    """Analyze logs for persona generation errors"""
    print("="*80)
    print(f"PERSONA GENERATION LOGS FOR: {user_email}")
    print("="*80)

    if not user_logs:
        print("\nNO LOGS FOUND for this user ID")
        print("\nPossible reasons:")
        print("  1. User signed up more than 7 days ago (Render free tier log retention)")
        print("  2. Persona generation hasn't been triggered yet")
        print("  3. User ID mismatch")
        return

    # Keywords to look for
    keywords = [
        "persona",
        "register_user",
        "generate_persona",
        "embeddings",
        "Failed",
        "Error",
        "Exception",
        "Traceback"
    ]

    relevant_logs = []
    for log in user_logs:
        if any(keyword.lower() in log.lower() for keyword in keywords):
            relevant_logs.append(log)

    if not relevant_logs:
        print(f"\nFound {len(user_logs)} logs for this user, but none mention persona generation.")
        print("\nAll logs:")
        for log in user_logs[:50]:  # Show first 50
            print(log)
        if len(user_logs) > 50:
            print(f"\n... and {len(user_logs) - 50} more lines")
    else:
        print(f"\nFound {len(relevant_logs)} relevant log lines:\n")
        for log in relevant_logs:
            print(log)

    print("\n" + "="*80)

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/fetch_user_signup_logs.py <email>")
        print("Example: python scripts/fetch_user_signup_logs.py ryan@stbl.io")
        sys.exit(1)

    email = sys.argv[1]

    print(f"\nFetching signup logs for: {email}")
    print("="*80)

    # Login
    print("\n1. Logging in as admin...")
    token = login()
    print("   Login successful")

    # Get user details
    print(f"\n2. Fetching user details...")
    user = get_user_details(token, email)

    if not user:
        sys.exit(1)

    print(f"   User ID: {user['id']}")
    print(f"   Created: {user['created_at']}")
    print(f"   Onboarding: {user.get('onboarding_status')}")

    if user.get('summary'):
        print(f"   Persona Status: {user['summary'].get('status')}")

    # Fetch Render logs
    print(f"\n3. Fetching Render AI service logs...")
    user_logs = fetch_render_logs(user['id'], user['created_at'])

    # Analyze logs
    print(f"\n4. Analyzing logs...")
    analyze_logs(user_logs, email)

    print("\n" + "="*80)
    print("NEXT STEPS")
    print("="*80)
    print("\nIf persona generation failed:")
    print("  1. Try 'Regen Embeddings' button in admin dashboard")
    print("  2. Check for missing ANTHROPIC_API_KEY in AI service env vars")
    print("  3. Verify DynamoDB connection (AWS credentials)")
    print("  4. Check Celery worker is running and processing tasks")
    print("\nIf no logs found:")
    print("  1. User might have signed up >7 days ago (log retention limit)")
    print("  2. Check creation date and try manual regeneration")

if __name__ == "__main__":
    main()
