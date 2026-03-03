"""
User Monitoring Script for Reciprocity Platform
-----------------------------------------------
Quick script to check active users and identify issues.

Usage:
    python scripts/monitor_users.py --active          # Show active users
    python scripts/monitor_users.py --stuck           # Show stuck onboarding
    python scripts/monitor_users.py --user <email>    # Check specific user
    python scripts/monitor_users.py --health          # System health
"""

import requests
import json
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Any

# Configuration
BACKEND_URL = "https://twoconnectv1-backend.onrender.com/api/v1"
ADMIN_EMAIL = "admin@example.com"  # Replace with your admin email
ADMIN_PASSWORD = "your_admin_password"  # Replace with your admin password

class ReciprocityMonitor:
    def __init__(self):
        self.token = None
        self.headers = None
        self.login()

    def login(self):
        """Login and get admin JWT token"""
        print("Logging in as admin...")
        response = requests.post(
            f"{BACKEND_URL}/auth/signin",
            json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
        )

        if response.status_code == 200:
            data = response.json()
            self.token = data['result']['access_token']
            self.headers = {"Authorization": f"Bearer {self.token}"}
            print("Login successful\n")
        else:
            print(f"ERROR: Login failed: {response.text}")
            exit(1)

    def get_active_users(self) -> List[Dict]:
        """Get users active in last 24 hours"""
        print("👥 Fetching active users...")

        response = requests.get(
            f"{BACKEND_URL}/admin/users/list",
            headers=self.headers,
            params={
                "page": 1,
                "limit": 100,
                "sort": "last_active_at",
                "order": "DESC"
            }
        )

        if response.status_code == 200:
            data = response.json()
            users = data['result']['users']

            # Filter to last 24 hours
            yesterday = datetime.now() - timedelta(days=1)
            active = []

            for user in users:
                if user.get('last_active_at'):
                    last_active = datetime.fromisoformat(user['last_active_at'].replace('Z', '+00:00'))
                    if last_active > yesterday:
                        active.append(user)

            return active
        else:
            print(f"ERROR: Failed to fetch users: {response.text}")
            return []

    def get_stuck_onboarding(self) -> List[Dict]:
        """Get users stuck in onboarding (started >1 hour ago, not completed)"""
        print("🚧 Checking for stuck onboarding...")

        response = requests.get(
            f"{BACKEND_URL}/admin/users/list",
            headers=self.headers,
            params={
                "page": 1,
                "limit": 100,
                "onboarding_status": "in_progress"
            }
        )

        if response.status_code == 200:
            data = response.json()
            users = data['result']['users']

            # Filter to stuck users (in progress > 1 hour)
            one_hour_ago = datetime.now() - timedelta(hours=1)
            stuck = []

            for user in users:
                created = datetime.fromisoformat(user['created_at'].replace('Z', '+00:00'))
                if created < one_hour_ago:
                    stuck.append(user)

            return stuck
        else:
            print(f"ERROR: Failed to fetch onboarding users: {response.text}")
            return []

    def get_user_details(self, email: str) -> Dict:
        """Get detailed info for a specific user"""
        print(f"🔍 Searching for user: {email}...")

        # First search for user
        response = requests.get(
            f"{BACKEND_URL}/admin/users/search",
            headers=self.headers,
            params={"query": email}
        )

        if response.status_code == 200:
            data = response.json()
            users = data['result']

            if not users:
                print(f"ERROR: No user found with email: {email}")
                return {}

            user_id = users[0]['id']

            # Get full details
            response = requests.get(
                f"{BACKEND_URL}/admin/users/{user_id}",
                headers=self.headers
            )

            if response.status_code == 200:
                return response.json()['result']
            else:
                print(f"ERROR: Failed to fetch user details: {response.text}")
                return {}
        else:
            print(f"ERROR: Failed to search users: {response.text}")
            return {}

    def get_system_health(self) -> Dict:
        """Get system health status"""
        print("🏥 Checking system health...")

        response = requests.get(
            f"{BACKEND_URL}/dashboard/admin/system-health",
            headers=self.headers
        )

        if response.status_code == 200:
            return response.json()['result']
        else:
            print(f"ERROR: Failed to fetch system health: {response.text}")
            return {}

    def get_onboarding_stats(self) -> Dict:
        """Get onboarding statistics"""
        print("📊 Fetching onboarding statistics...")

        response = requests.get(
            f"{BACKEND_URL}/admin/dashboard/user-onboarding-statistics",
            headers=self.headers
        )

        if response.status_code == 200:
            return response.json()['result']
        else:
            print(f"ERROR: Failed to fetch onboarding stats: {response.text}")
            return {}

    def print_active_users(self, users: List[Dict]):
        """Pretty print active users"""
        print(f"\nOK: Found {len(users)} active users in last 24 hours:\n")
        print(f"{'Email':<40} {'Name':<25} {'Status':<15} {'Last Active':<20}")
        print("-" * 100)

        for user in users:
            email = user.get('email', 'N/A')
            name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or 'N/A'
            status = user.get('onboarding_status', 'N/A')
            last_active = user.get('last_active_at', 'N/A')

            # Format timestamp
            if last_active != 'N/A':
                dt = datetime.fromisoformat(last_active.replace('Z', '+00:00'))
                last_active = dt.strftime('%Y-%m-%d %H:%M')

            print(f"{email:<40} {name:<25} {status:<15} {last_active:<20}")

    def print_stuck_users(self, users: List[Dict]):
        """Pretty print stuck onboarding users"""
        print(f"\nWARNING: Found {len(users)} users stuck in onboarding:\n")
        print(f"{'Email':<40} {'Name':<25} {'Created':<20} {'Duration (hrs)':<15}")
        print("-" * 100)

        for user in users:
            email = user.get('email', 'N/A')
            name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or 'N/A'
            created = user.get('created_at', 'N/A')

            # Calculate duration
            if created != 'N/A':
                dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                duration = (datetime.now() - dt.replace(tzinfo=None)).total_seconds() / 3600
                created_str = dt.strftime('%Y-%m-%d %H:%M')
            else:
                duration = 0
                created_str = 'N/A'

            print(f"{email:<40} {name:<25} {created_str:<20} {duration:<15.1f}")

    def print_user_details(self, user: Dict):
        """Pretty print user details"""
        if not user:
            return

        print("\n" + "="*80)
        print("USER DETAILS")
        print("="*80)

        # Basic info
        print(f"\n📧 Email: {user.get('email')}")
        print(f"👤 Name: {user.get('first_name')} {user.get('last_name')}")
        print(f"🆔 ID: {user.get('id')}")
        print(f"📅 Created: {user.get('created_at')}")
        print(f"🕐 Last Active: {user.get('last_active_at')}")

        # Status
        print(f"\n📊 Status:")
        print(f"  Onboarding: {user.get('onboarding_status')}")
        print(f"  Account: {'Active' if user.get('is_active') else 'Inactive'}")

        # Summary
        if user.get('summary'):
            print(f"\n📝 AI Summary:")
            summary = user['summary']
            print(f"  Status: {summary.get('status', 'N/A')}")
            print(f"  Version: {summary.get('version', 'N/A')}")
            print(f"  Webhook: {summary.get('webhook', 'N/A')}")

        # Documents
        if user.get('documents'):
            print(f"\n📄 Documents: {len(user['documents'])}")
            for doc in user['documents']:
                print(f"  - {doc.get('document_type')}: {doc.get('document_name')}")

        # Match analytics
        if user.get('match_analytics'):
            analytics = user['match_analytics']
            print(f"\n🎯 Match Analytics:")
            print(f"  Total Matches: {analytics.get('total_matches', 0)}")
            print(f"  Approved: {analytics.get('total_approved', 0)}")
            print(f"  Rejected: {analytics.get('total_rejected', 0)}")
            print(f"  Pending: {analytics.get('total_pending', 0)}")
            print(f"  Approval Rate: {analytics.get('approval_rate', 0):.1f}%")

        print("\n" + "="*80)

    def print_system_health(self, health: Dict):
        """Pretty print system health"""
        if not health:
            return

        print("\n" + "="*80)
        print("SYSTEM HEALTH")
        print("="*80)

        print(f"\n🏥 Overall Status: {health.get('overall_status', 'unknown').upper()}")
        print(f" Timestamp: {health.get('timestamp')}")

        # AI Service
        if 'ai_service' in health:
            ai = health['ai_service']
            print(f"\n🤖 AI Service: {ai.get('status', 'unknown').upper()}")
            for comp, detail in ai.get('components', {}).items():
                status_icon = "OK:" if detail['status'] == 'healthy' else "WARNING:" if detail['status'] == 'warning' else "ERROR:"
                print(f"  {status_icon} {comp}: {detail.get('detail', 'N/A')}")

        # Onboarding
        if 'onboarding' in health:
            onb = health['onboarding']
            print(f"\n📝 Onboarding: {onb.get('status', 'unknown').upper()}")
            for comp, detail in onb.get('components', {}).items():
                status_icon = "OK:" if detail['status'] == 'healthy' else "WARNING:" if detail['status'] == 'warning' else "ERROR:"
                print(f"  {status_icon} {comp}: {detail.get('detail', 'N/A')}")

        # Matching
        if 'matching' in health:
            match = health['matching']
            print(f"\n🎯 Matching: {match.get('status', 'unknown').upper()}")
            for comp, detail in match.get('components', {}).items():
                status_icon = "OK:" if detail['status'] == 'healthy' else "WARNING:" if detail['status'] == 'warning' else "ERROR:"
                print(f"  {status_icon} {comp}: {detail.get('detail', 'N/A')}")

        # Issues
        if health.get('issues'):
            print(f"\nWARNING: Issues:")
            for issue in health['issues']:
                print(f"  - {issue}")

        print("\n" + "="*80)

    def print_onboarding_stats(self, stats: List[Dict]):
        """Pretty print onboarding statistics"""
        print("\n📊 ONBOARDING STATISTICS\n")
        print(f"{'Status':<20} {'Label':<30} {'Count':<10}")
        print("-" * 60)

        total = 0
        for stat in stats:
            status = stat.get('status', 'N/A')
            label = stat.get('label', 'N/A')
            count = stat.get('count', 0)
            total += count
            print(f"{status:<20} {label:<30} {count:<10}")

        print("-" * 60)
        print(f"{'TOTAL':<20} {'':<30} {total:<10}\n")


def main():
    parser = argparse.ArgumentParser(description="Monitor Reciprocity Platform Users")
    parser.add_argument('--active', action='store_true', help='Show active users (last 24 hours)')
    parser.add_argument('--stuck', action='store_true', help='Show users stuck in onboarding')
    parser.add_argument('--user', type=str, help='Get details for specific user (email)')
    parser.add_argument('--health', action='store_true', help='Show system health')
    parser.add_argument('--stats', action='store_true', help='Show onboarding statistics')

    args = parser.parse_args()

    # Initialize monitor
    monitor = ReciprocityMonitor()

    # Execute requested action
    if args.active:
        users = monitor.get_active_users()
        monitor.print_active_users(users)

    elif args.stuck:
        users = monitor.get_stuck_onboarding()
        monitor.print_stuck_users(users)

    elif args.user:
        user = monitor.get_user_details(args.user)
        monitor.print_user_details(user)

    elif args.health:
        health = monitor.get_system_health()
        monitor.print_system_health(health)

    elif args.stats:
        stats = monitor.get_onboarding_stats()
        monitor.print_onboarding_stats(stats)

    else:
        # Default: show summary
        print("\n📊 PLATFORM SUMMARY\n")

        # Health check
        health = monitor.get_system_health()
        if health:
            status = health.get('overall_status', 'unknown').upper()
            status_icon = "OK:" if status == 'HEALTHY' else "WARNING:" if status == 'WARNING' else "ERROR:"
            print(f"  {status_icon} System Status: {status}")

        # Onboarding stats
        stats = monitor.get_onboarding_stats()
        if stats:
            total_users = sum(s.get('count', 0) for s in stats)
            in_progress = next((s.get('count', 0) for s in stats if s.get('status') == 'in_progress'), 0)
            completed = next((s.get('count', 0) for s in stats if s.get('status') == 'completed'), 0)

            print(f"  👥 Total Users: {total_users}")
            print(f"   In Progress: {in_progress}")
            print(f"  OK: Completed: {completed}")

        # Active users
        active = monitor.get_active_users()
        print(f"  🔥 Active (24h): {len(active)}")

        # Stuck users
        stuck = monitor.get_stuck_onboarding()
        if stuck:
            print(f"  WARNING: Stuck in Onboarding: {len(stuck)}")

        print("\nUse --help to see all available commands\n")


if __name__ == "__main__":
    main()
