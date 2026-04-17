"""
Fetch recent Render AI service logs and filter for a specific user.
No authentication needed - just uses Render CLI.

Usage: python scripts/fetch_ai_logs_for_user.py <user_id>
Example: python scripts/fetch_ai_logs_for_user.py 87673b59-f0d0-4849-8d63-632a792dc6ab
"""
import sys
import subprocess

# Configuration
RENDER_SERVICE_ID = "srv-d6fclni4d50c73eaa7fg"  # 2connectv1-ai service

def fetch_logs_for_user(user_id, num_lines=20000):
    """Fetch recent Render logs and filter for user_id"""
    print(f"\nFetching last {num_lines} lines from AI service logs...")
    print(f"Looking for user_id: {user_id}\n")

    # Use render CLI to fetch logs
    cmd = [
        "render.exe",
        "logs",
        "-r", RENDER_SERVICE_ID,
        "-o", "text",
        "--tail", str(num_lines)
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120
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
        print("ERROR: render.exe not found at C:\\Users\\hp\\render.exe")
        print("\nMake sure Render CLI is installed and accessible.")
        print("Current installation: C:\\Users\\hp\\render.exe")
        return None

def analyze_logs(user_logs, user_id):
    """Analyze logs for persona generation errors"""
    print("="*80)
    print(f"LOGS FOR USER: {user_id}")
    print("="*80)

    if not user_logs:
        print("\nNO LOGS FOUND for this user ID in recent logs")
        print("\nPossible reasons:")
        print("  1. User signed up more than 7 days ago (Render free tier retention)")
        print("  2. Persona generation task hasn't run yet")
        print("  3. Task failed silently without logging user_id")
        print("\nTry checking:")
        print("  1. User's creation date in admin dashboard")
        print("  2. Celery worker logs (look for 'generate_persona_task')")
        print("  3. Recent errors in AI service logs")
        return

    print(f"\nFound {len(user_logs)} log lines for this user\n")

    # Categorize logs
    persona_logs = []
    embedding_logs = []
    error_logs = []
    other_logs = []

    for log in user_logs:
        log_lower = log.lower()
        if 'error' in log_lower or 'failed' in log_lower or 'exception' in log_lower:
            error_logs.append(log)
        elif 'persona' in log_lower or 'generate_persona' in log_lower:
            persona_logs.append(log)
        elif 'embedding' in log_lower or 'vector' in log_lower:
            embedding_logs.append(log)
        else:
            other_logs.append(log)

    # Print categorized logs
    if error_logs:
        print("=" * 80)
        print("ERRORS & FAILURES")
        print("=" * 80)
        for log in error_logs:
            print(log)

    if persona_logs:
        print("\n" + "=" * 80)
        print("PERSONA GENERATION")
        print("=" * 80)
        for log in persona_logs:
            print(log)

    if embedding_logs:
        print("\n" + "=" * 80)
        print("EMBEDDINGS")
        print("=" * 80)
        for log in embedding_logs:
            print(log)

    if other_logs and len(other_logs) <= 20:
        print("\n" + "=" * 80)
        print("OTHER LOGS")
        print("=" * 80)
        for log in other_logs:
            print(log)

    print("\n" + "=" * 80)
    print("ANALYSIS")
    print("=" * 80)

    if error_logs:
        print(f"\nERROR: Found {len(error_logs)} error(s)")
        print("   - Review errors above for root cause")
    else:
        print("\nOK: No explicit errors found")

    if persona_logs:
        print(f"\nOK: Found {len(persona_logs)} persona-related log(s)")
    else:
        print("\nWARNING: No persona generation logs found")
        print("   - Persona task might not have executed")

    if embedding_logs:
        print(f"\nOK: Found {len(embedding_logs)} embedding-related log(s)")
    else:
        print("\nWARNING: No embedding logs found")

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/fetch_ai_logs_for_user.py <user_id>")
        print("\nExamples:")
        print("  python scripts/fetch_ai_logs_for_user.py 87673b59-f0d0-4849-8d63-632a792dc6ab")
        print("  python scripts/fetch_ai_logs_for_user.py b8f23b31-f935-4716-b2cc-7baa7fc81da4")
        sys.exit(1)

    user_id = sys.argv[1]

    # Fetch logs
    user_logs = fetch_logs_for_user(user_id)

    # Analyze
    analyze_logs(user_logs, user_id)

    print("\n" + "="*80)
    print("NEXT STEPS")
    print("="*80)
    print("\n1. If errors found - Fix the root cause")
    print("2. If no logs found - User might have signed up >7 days ago")
    print("3. Try 'Regen Embeddings' button in admin dashboard")
    print("4. Check Celery worker is running: celery -A app.workers.celery_worker inspect active")
    print("5. Verify environment variables in AI service:")
    print("   - ANTHROPIC_API_KEY")
    print("   - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY")
    print("   - DYNAMO_PROFILE_TABLE_NAME")

if __name__ == "__main__":
    main()
