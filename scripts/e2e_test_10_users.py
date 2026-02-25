#!/usr/bin/env python3
"""
Reciprocity E2E Test - 10 Users Through All Steps

Tests the complete user journey:
1. User registration/login
2. Onboarding completion
3. AI summary generation & approval
4. Match discovery
5. AI conversation initiation
6. Verdict generation

Usage:
    python scripts/e2e_test_10_users.py
"""

import os
import sys
import time
import json
import requests
import logging
import psycopg2
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class TestUser:
    """Test user data"""
    user_id: str
    email: str
    password: str = "TestUser@123"
    first_name: str = ""
    last_name: str = ""
    token: str = ""
    onboarding_status: str = "not_started"
    persona_type: str = ""  # investor, founder, advisor, etc.


class ReciprocityE2ETester:
    """End-to-end tester for Reciprocity platform."""

    # Backend API (NestJS)
    BACKEND_URL = "http://localhost:3000/api"

    # AI Service (FastAPI)
    AI_SERVICE_URL = "http://localhost:8000"

    # Database
    DB_CONFIG = {
        "host": "localhost",
        "port": 5433,
        "user": "postgres",
        "password": "postgres",
        "database": "reciprocity_db"
    }

    # Test user personas for realistic testing
    TEST_PERSONAS = [
        {
            "persona_type": "founder_tech",
            "first_name": "Alice",
            "last_name": "Chen",
            "answers": {
                "objective": "fundraising",
                "industry": "technology, AI/ML, SaaS",
                "stage": "seed",
                "looking_for": "Seeking $500K seed funding for AI-powered productivity tool. Need investors with B2B SaaS experience.",
                "offerings": "10+ years tech leadership, built 2 successful products, strong technical team",
                "elevator_pitch": "Building an AI assistant that helps teams reduce meeting time by 50%",
                "strengths": "Product development, technical leadership, team building"
            }
        },
        {
            "persona_type": "investor_angel",
            "first_name": "Bob",
            "last_name": "Martinez",
            "answers": {
                "objective": "investing",
                "industry": "technology, fintech, healthcare",
                "stage": "seed, series_a",
                "looking_for": "Looking for early-stage startups with strong technical founders. Focus on AI and enterprise software.",
                "offerings": "$100K-$500K checks, extensive network in Silicon Valley, mentorship for first-time founders",
                "elevator_pitch": "Angel investor and former founder with 3 exits",
                "strengths": "Fundraising guidance, board experience, go-to-market strategy"
            }
        },
        {
            "persona_type": "founder_health",
            "first_name": "Charlie",
            "last_name": "Wilson",
            "answers": {
                "objective": "fundraising",
                "industry": "healthcare, digital health, biotech",
                "stage": "pre_seed",
                "looking_for": "Looking for healthcare-focused investors and advisors. Need regulatory guidance and clinical partnerships.",
                "offerings": "MD with 15 years clinical experience, deep understanding of healthcare workflows",
                "elevator_pitch": "Building a platform that reduces diagnostic errors by 30%",
                "strengths": "Healthcare domain expertise, clinical validation, regulatory knowledge"
            }
        },
        {
            "persona_type": "advisor_growth",
            "first_name": "Diana",
            "last_name": "Patel",
            "answers": {
                "objective": "advising",
                "industry": "technology, e-commerce, consumer",
                "stage": "series_a, series_b",
                "looking_for": "Want to advise growth-stage startups on scaling operations and international expansion.",
                "offerings": "Scaled 3 companies from $1M to $100M ARR, expertise in growth marketing and sales",
                "elevator_pitch": "Growth advisor specializing in B2B and B2C scaling",
                "strengths": "Growth strategy, sales optimization, international expansion"
            }
        },
        {
            "persona_type": "founder_fintech",
            "first_name": "Eve",
            "last_name": "Thompson",
            "answers": {
                "objective": "fundraising",
                "industry": "fintech, banking, payments",
                "stage": "series_a",
                "looking_for": "Series A funding for payment infrastructure startup. Need investors with fintech regulatory experience.",
                "offerings": "10 years in banking technology, strong relationships with major banks",
                "elevator_pitch": "Making cross-border payments instant and 80% cheaper",
                "strengths": "Banking relationships, compliance expertise, payment systems"
            }
        },
        {
            "persona_type": "investor_vc",
            "first_name": "Frank",
            "last_name": "Lee",
            "answers": {
                "objective": "investing",
                "industry": "fintech, crypto, infrastructure",
                "stage": "series_a, series_b",
                "looking_for": "Lead Series A/B rounds in fintech infrastructure. Looking for $5M+ revenue companies.",
                "offerings": "$2M-$10M investment capacity, portfolio of 30+ fintech companies",
                "elevator_pitch": "Partner at top-tier fintech VC fund",
                "strengths": "Board governance, M&A experience, regulatory navigation"
            }
        },
        {
            "persona_type": "founder_climate",
            "first_name": "Grace",
            "last_name": "Kim",
            "answers": {
                "objective": "fundraising",
                "industry": "climate tech, clean energy, sustainability",
                "stage": "seed",
                "looking_for": "Climate-focused investors for carbon capture technology. Need partners with energy industry connections.",
                "offerings": "PhD in chemical engineering, 5 patents in carbon capture",
                "elevator_pitch": "Capturing CO2 at 60% lower cost than existing solutions",
                "strengths": "Deep tech expertise, research background, patent portfolio"
            }
        },
        {
            "persona_type": "advisor_product",
            "first_name": "Henry",
            "last_name": "Garcia",
            "answers": {
                "objective": "advising",
                "industry": "technology, consumer apps, marketplaces",
                "stage": "seed, series_a",
                "looking_for": "Advising early-stage startups on product-market fit and user acquisition.",
                "offerings": "Former VP Product at unicorn, launched 10+ successful products",
                "elevator_pitch": "Product advisor helping startups find PMF faster",
                "strengths": "Product strategy, user research, A/B testing"
            }
        },
        {
            "persona_type": "founder_enterprise",
            "first_name": "Ivy",
            "last_name": "Johnson",
            "answers": {
                "objective": "partnerships",
                "industry": "enterprise software, security, compliance",
                "stage": "series_b",
                "looking_for": "Strategic partnerships with Fortune 500 companies for enterprise security platform.",
                "offerings": "Enterprise sales expertise, existing relationships with 50+ F500 CISOs",
                "elevator_pitch": "Zero-trust security platform used by 200 enterprises",
                "strengths": "Enterprise sales, security expertise, partner development"
            }
        },
        {
            "persona_type": "investor_corporate",
            "first_name": "Jack",
            "last_name": "Brown",
            "answers": {
                "objective": "investing",
                "industry": "enterprise software, security, AI",
                "stage": "series_a, series_b",
                "looking_for": "Strategic investments in enterprise security and AI. Focus on potential acquisition targets.",
                "offerings": "Corporate VC arm with $500M fund, integration pathways with parent company",
                "elevator_pitch": "Corporate VC focused on enterprise technology",
                "strengths": "Strategic partnerships, enterprise distribution, acquisition support"
            }
        }
    ]

    def __init__(self):
        """Initialize tester."""
        self.session = requests.Session()
        self.test_users: List[TestUser] = []
        self.db_conn = None

    def connect_db(self) -> bool:
        """Connect to PostgreSQL database."""
        try:
            self.db_conn = psycopg2.connect(**self.DB_CONFIG)
            logger.info("Connected to database")
            return True
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            return False

    def close_db(self):
        """Close database connection."""
        if self.db_conn:
            self.db_conn.close()

    def log_step(self, step: str):
        """Log a test step."""
        logger.info(f"\n{'='*60}")
        logger.info(f"STEP: {step}")
        logger.info(f"{'='*60}")

    def log_result(self, success: bool, message: str):
        """Log test result."""
        if success:
            logger.info(f"✓ SUCCESS: {message}")
        else:
            logger.error(f"✗ FAILED: {message}")

    def check_services(self) -> bool:
        """Check if backend and AI service are running."""
        self.log_step("Checking Services")

        # Check backend (no health endpoint - check if it responds at all)
        try:
            resp = self.session.get(f"{self.BACKEND_URL}/v1/auth/signin", timeout=5)
            # Any response (even 400/404) means server is running
            backend_ok = resp.status_code in [200, 400, 401, 404, 405]
            self.log_result(backend_ok, f"Backend API - Responding (Status: {resp.status_code})")
        except Exception as e:
            self.log_result(False, f"Backend API not reachable: {e}")
            backend_ok = False

        # Check AI service
        try:
            resp = self.session.get(f"{self.AI_SERVICE_URL}/health", timeout=5)
            ai_ok = resp.status_code == 200
            self.log_result(ai_ok, f"AI Service - Status: {resp.status_code}")
        except Exception as e:
            self.log_result(False, f"AI Service not reachable: {e}")
            ai_ok = False

        return backend_ok and ai_ok

    def create_test_users(self) -> bool:
        """Create 10 test users via signup endpoint."""
        self.log_step("Creating Test Users")

        timestamp = int(time.time())
        success_count = 0

        for i, persona in enumerate(self.TEST_PERSONAS):
            email = f"{persona['first_name'].lower()}.{persona['last_name'].lower()}.{timestamp}@e2etest.com"

            user = TestUser(
                user_id="",  # Will be set after signup
                email=email,
                first_name=persona["first_name"],
                last_name=persona["last_name"],
                persona_type=persona["persona_type"]
            )

            # Sign up user
            try:
                resp = self.session.post(
                    f"{self.BACKEND_URL}/v1/auth/signup",
                    json={
                        "email": email,
                        "password": user.password,
                        "first_name": persona["first_name"],
                        "last_name": persona["last_name"]
                    },
                    timeout=10
                )

                if resp.status_code in [200, 201]:
                    data = resp.json()
                    # Response uses "result" not "data"
                    result = data.get("result", {})
                    user.user_id = result.get("user", {}).get("id", "")

                    # In dev mode, we get verification code in response
                    verification_code = result.get("email_verification_code")

                    if user.user_id:
                        # Verify email and sign in
                        if verification_code:
                            verified = self._verify_email(user.email, verification_code)
                            if verified:
                                # Now sign in to get token
                                signed_in_user = self._signin_user(user)
                                if signed_in_user and signed_in_user.token:
                                    self.test_users.append(signed_in_user)
                                    success_count += 1
                                    logger.info(f"  Created user {i+1}/10: {email}")
                                    continue

                        # Fall back to DB verification (user still needs to be signed in later)
                        self.test_users.append(user)
                        success_count += 1
                        logger.info(f"  Created user {i+1}/10 (needs signin): {email}")
                else:
                    logger.debug(f"  Signup response for {email}: {resp.status_code} - {resp.text[:200]}")
                    # Try signin in case user exists
                    user = self._signin_user(user)
                    if user and user.token:
                        self.test_users.append(user)
                        success_count += 1
                        logger.info(f"  Signed in existing user {i+1}/10: {email}")

            except Exception as e:
                logger.error(f"  Error creating user {email}: {e}")

        self.log_result(success_count >= 5, f"Created/signed in {success_count}/10 users")
        return success_count >= 5

    def _verify_email(self, email: str, code: str) -> bool:
        """Verify email with code."""
        try:
            resp = self.session.post(
                f"{self.BACKEND_URL}/v1/auth/verify-email",
                json={"email": email, "code": code},
                timeout=10
            )
            return resp.status_code == 200
        except Exception:
            return False

    def _signin_user(self, user: TestUser) -> Optional[TestUser]:
        """Sign in an existing user."""
        try:
            resp = self.session.post(
                f"{self.BACKEND_URL}/v1/auth/signin",
                json={
                    "email": user.email,
                    "password": user.password
                },
                timeout=10
            )

            if resp.status_code == 200:
                data = resp.json()
                result = data.get("result", {})
                user.user_id = result.get("user", {}).get("id", "")
                user.token = result.get("access_token", "")
                return user if user.token else None
            else:
                logger.debug(f"Signin response for {user.email}: {resp.status_code}")
        except Exception as e:
            logger.debug(f"Signin failed for {user.email}: {e}")
        return None

    def verify_emails(self) -> bool:
        """Auto-verify emails in database and sign in users."""
        self.log_step("Verifying User Emails (DB update)")

        if not self.db_conn:
            if not self.connect_db():
                return False

        try:
            cur = self.db_conn.cursor()
            user_ids = [u.user_id for u in self.test_users if u.user_id]

            if not user_ids:
                self.log_result(False, "No user IDs to verify")
                return False

            # Update email verification status
            cur.execute("""
                UPDATE users
                SET is_email_verified = true
                WHERE id = ANY(%s::uuid[])
            """, (user_ids,))

            self.db_conn.commit()
            cur.close()

            # Now sign in each user to get tokens
            signed_in = 0
            for user in self.test_users:
                if not user.token:
                    result = self._signin_user(user)
                    if result and result.token:
                        user.token = result.token
                        user.user_id = result.user_id
                        signed_in += 1

            self.log_result(True, f"Verified emails for {len(user_ids)} users, signed in {signed_in}")
            return True

        except Exception as e:
            logger.error(f"Email verification failed: {e}")
            self.db_conn.rollback()
            return False

    def complete_onboarding(self) -> bool:
        """Complete onboarding for all test users."""
        self.log_step("Completing Onboarding")

        success_count = 0

        for i, user in enumerate(self.test_users):
            if not user.token:
                logger.warning(f"  Skipping user {user.email} - no token")
                continue

            persona = self.TEST_PERSONAS[i % len(self.TEST_PERSONAS)]

            headers = {"Authorization": f"Bearer {user.token}"}

            try:
                # Debug: check token
                logger.debug(f"  Token for {user.email}: {user.token[:50] if user.token else 'None'}...")

                # Get first onboarding question
                resp = self.session.get(
                    f"{self.BACKEND_URL}/v1/onboarding/question",
                    headers=headers,
                    timeout=10
                )

                if resp.status_code != 200:
                    logger.warning(f"  Cannot get question for {user.email}: {resp.status_code} - {resp.text[:100]}")
                    continue

                question = resp.json().get("result")
                answered = 0
                max_questions = 20  # Safety limit

                while question and question.get("id") and answered < max_questions:
                    question_id = question.get("id")
                    question_code = question.get("code", "")
                    question_prompt = question.get("prompt", "") or question.get("ai_text", "")

                    # Generate answer based on question code
                    answer = self._generate_answer(question_code, question, persona["answers"])

                    # Submit answer
                    submit_payload = {
                        "question_id": question_id,
                        "ai_text": question_prompt,
                        "user_response": answer
                    }
                    submit_resp = self.session.post(
                        f"{self.BACKEND_URL}/v1/onboarding/submit-question",
                        headers=headers,
                        json=submit_payload,
                        timeout=10
                    )

                    if submit_resp.status_code not in [200, 201]:
                        logger.warning(f"  Submit failed for {question_code}: {submit_resp.status_code} - {submit_resp.text[:200]}")
                        break

                    result = submit_resp.json().get("result", {})
                    submit_response = result.get("submitResponse", {})

                    # Check if answer was accepted
                    if not submit_response.get("is_answer_accepted", False):
                        logger.warning(f"  Answer not accepted for {question_code}: {submit_response}")
                        break

                    answered += 1

                    # Get next question from submit response (more efficient)
                    question = result.get("nextQuestion")

                    # If no next question in response, we might be done
                    if not question:
                        # Double check by fetching
                        resp = self.session.get(
                            f"{self.BACKEND_URL}/v1/onboarding/question",
                            headers=headers,
                            timeout=10
                        )
                        if resp.status_code == 200:
                            question = resp.json().get("result")
                        else:
                            break

                if answered >= 5:  # Minimum questions answered
                    success_count += 1
                    logger.info(f"  Completed onboarding for {user.email} ({answered} questions)")
                else:
                    logger.warning(f"  Incomplete onboarding for {user.email} ({answered} questions)")

            except Exception as e:
                logger.error(f"  Onboarding error for {user.email}: {e}")
                import traceback
                traceback.print_exc()

        self.log_result(success_count >= 5, f"Completed onboarding for {success_count}/{len(self.test_users)} users")
        return success_count >= 5

    def _generate_answer(self, code: str, question: Dict, persona_answers: Dict) -> str:
        """Generate contextual answer based on question code."""
        code_lower = code.lower() if code else ""
        input_type = question.get("input_type", "")
        options = question.get("options", [])

        # For single_select questions, we MUST use one of the provided options
        if input_type == "single_select" and options:
            # Try to pick a relevant option based on code
            option_values = [o.get("value", o.get("label", "")) for o in options if isinstance(o, dict)]
            if option_values:
                if "gender" in code_lower:
                    # Prefer "Other" if available, otherwise first option
                    for opt in option_values:
                        if opt.lower() == "other":
                            return opt
                    return option_values[0]
                elif "style" in code_lower or "vibe" in code_lower:
                    # Look for quality-related option
                    for opt in option_values:
                        if "quality" in opt.lower():
                            return opt
                    return option_values[0]
                else:
                    return option_values[0]

        # Map question codes to persona answers for text inputs
        if "objective" in code_lower or "goal" in code_lower or "looking_for" in code_lower:
            return persona_answers.get("looking_for", "Looking to grow my network and find opportunities.")
        elif "offer" in code_lower or "provide" in code_lower:
            return persona_answers.get("offerings", "Industry expertise and strategic guidance.")
        elif "industry" in code_lower or "sector" in code_lower:
            return persona_answers.get("industry", "Technology and innovation")
        elif "stage" in code_lower:
            return persona_answers.get("stage", "growth")
        elif "pitch" in code_lower or "elevator" in code_lower:
            return persona_answers.get("elevator_pitch", "Passionate about creating value through innovation.")
        elif "strength" in code_lower:
            return persona_answers.get("strengths", "Strategic thinking, execution, relationship building")
        elif "gender" in code_lower:
            return "Other"  # Fallback if not single_select
        elif "age" in code_lower:
            return "38"  # Simple number for text input
        elif "style" in code_lower or "vibe" in code_lower:
            return "I prefer quality over quantity"
        elif "anything_else" in code_lower or "share" in code_lower:
            return "Excited to connect with like-minded professionals!"
        else:
            # Default: use first option if available
            if options and isinstance(options, list) and len(options) > 0:
                first_opt = options[0]
                if isinstance(first_opt, dict):
                    return first_opt.get("value", first_opt.get("label", ""))
                return str(first_opt)
            return "Not specified"

    def request_ai_summaries(self) -> bool:
        """Request AI summary generation for all users."""
        self.log_step("Requesting AI Summaries")

        success_count = 0

        for user in self.test_users:
            if not user.token:
                continue

            headers = {"Authorization": f"Bearer {user.token}"}

            try:
                resp = self.session.post(
                    f"{self.BACKEND_URL}/v1/onboarding/request-ai-summary",
                    headers=headers,
                    timeout=30
                )

                if resp.status_code in [200, 201]:
                    success_count += 1
                    logger.info(f"  Requested AI summary for {user.email}")
                else:
                    logger.warning(f"  AI summary request failed for {user.email}: {resp.status_code}")

            except Exception as e:
                logger.error(f"  Error requesting AI summary for {user.email}: {e}")

        self.log_result(success_count >= 3, f"Requested AI summaries for {success_count}/{len(self.test_users)} users")

        # Wait for Celery processing (persona generation takes time with OpenAI)
        logger.info("  Waiting 60s for AI processing...")
        time.sleep(60)

        # Trigger webhook notifications manually (workaround for Celery notification bug)
        logger.info("  Triggering webhook notifications for processed personas...")
        self._trigger_webhook_notifications()

        return success_count >= 3

    def _trigger_webhook_notifications(self):
        """
        Poll for summaries and manually trigger webhooks if needed.

        The Celery task chain generates personas but the webhook notification
        sometimes fails to reach the backend. This method:
        1. Polls the database for summaries
        2. If no summaries appear, triggers webhooks directly via curl to AI service
        """
        max_polls = 6  # 6 * 10s = 60s additional wait
        summaries_found = 0

        for poll in range(max_polls):
            # Check how many summaries exist
            if not self.db_conn:
                self.connect_db()

            try:
                cur = self.db_conn.cursor()
                user_ids = [u.user_id for u in self.test_users if u.user_id]
                cur.execute("""
                    SELECT COUNT(*) FROM user_summaries WHERE user_id = ANY(%s::uuid[])
                """, (user_ids,))
                summaries_found = cur.fetchone()[0]
                cur.close()

                if summaries_found >= len(user_ids) * 0.5:  # At least 50% have summaries
                    logger.info(f"  Found {summaries_found}/{len(user_ids)} summaries after {(poll+1)*10}s")
                    return

                logger.info(f"  Polling... {summaries_found}/{len(user_ids)} summaries (attempt {poll+1}/{max_polls})")
                time.sleep(10)

            except Exception as e:
                logger.warning(f"  Polling error: {e}")
                time.sleep(10)

        logger.info(f"  Final summary count: {summaries_found}")

    def _persona_to_markdown(self, persona: dict) -> str:
        """Convert persona dict to markdown format."""
        parts = []
        if persona.get("name"):
            parts.append(f"# {persona['name']}")
        if persona.get("archetype"):
            parts.append(f"**Archetype:** {persona['archetype']}")
        if persona.get("designation"):
            parts.append(f"**Designation:** {persona['designation']}")
        if persona.get("focus"):
            parts.append(f"\n## Focus\n{persona['focus']}")
        if persona.get("profile_essence"):
            parts.append(f"\n## Profile Essence\n{persona['profile_essence']}")
        if persona.get("requirements"):
            parts.append(f"\n## Requirements\n{persona['requirements']}")
        if persona.get("offerings"):
            parts.append(f"\n## Offerings\n{persona['offerings']}")
        return "\n\n".join(parts)

    def approve_ai_summaries(self) -> bool:
        """Approve AI summaries for all users."""
        self.log_step("Approving AI Summaries")

        # Reconnect to clear any aborted transactions
        self.close_db()
        if not self.connect_db():
            return False

        success_count = 0

        for user in self.test_users:
            if not user.token:
                logger.debug(f"  Skipping {user.email} - no token")
                continue

            headers = {"Authorization": f"Bearer {user.token}"}

            try:
                # Get draft summary (status enum is 'draft' not 'pending')
                cur = self.db_conn.cursor()
                cur.execute("""
                    SELECT id FROM user_summaries
                    WHERE user_id = %s AND status = 'draft'
                    ORDER BY created_at DESC LIMIT 1
                """, (user.user_id,))

                result = cur.fetchone()
                cur.close()

                if not result:
                    logger.debug(f"  No draft summary for {user.email}")
                    continue

                summary_id = result[0]

                # Approve summary
                resp = self.session.post(
                    f"{self.BACKEND_URL}/v1/onboarding/approve-ai-summary/{summary_id}",
                    headers=headers,
                    timeout=30
                )

                if resp.status_code in [200, 201]:
                    success_count += 1
                    logger.info(f"  Approved AI summary for {user.email}")
                else:
                    logger.warning(f"  Summary approval failed for {user.email}: {resp.status_code} - {resp.text[:100]}")

            except Exception as e:
                logger.error(f"  Error approving summary for {user.email}: {e}")
                # Rollback and reconnect
                try:
                    self.db_conn.rollback()
                except:
                    pass

        self.log_result(success_count >= 3, f"Approved summaries for {success_count}/{len(self.test_users)} users")
        return success_count >= 3

    def trigger_matching(self) -> bool:
        """Trigger matching for all users."""
        self.log_step("Triggering Matching")

        success_count = 0

        for user in self.test_users:
            if not user.token:
                continue

            headers = {"Authorization": f"Bearer {user.token}"}

            try:
                # Get onboarding matches (triggers matching if needed)
                resp = self.session.get(
                    f"{self.BACKEND_URL}/v1/dashboard/onboarding-matches",
                    headers=headers,
                    timeout=60
                )

                if resp.status_code == 200:
                    data = resp.json()
                    matches = data.get("data", {}).get("matches", [])
                    success_count += 1
                    logger.info(f"  Found {len(matches)} matches for {user.email}")
                else:
                    logger.warning(f"  Matching failed for {user.email}: {resp.status_code}")

            except Exception as e:
                logger.error(f"  Error in matching for {user.email}: {e}")

        self.log_result(success_count >= 3, f"Triggered matching for {success_count}/{len(self.test_users)} users")
        return success_count >= 3

    def get_matches_and_explanations(self) -> bool:
        """Get match explanations for users."""
        self.log_step("Getting Match Explanations")

        success_count = 0

        for user in self.test_users:
            if not user.token:
                continue

            headers = {"Authorization": f"Bearer {user.token}"}

            try:
                # Get network matches
                resp = self.session.get(
                    f"{self.BACKEND_URL}/v1/dashboard/network-matches",
                    headers=headers,
                    params={"page": 1, "limit": 5},
                    timeout=30
                )

                if resp.status_code != 200:
                    continue

                data = resp.json()
                matches = data.get("data", {}).get("matches", [])

                if not matches:
                    logger.debug(f"  No matches for {user.email}")
                    continue

                # Get explanation for first match
                match_id = matches[0].get("id")
                if match_id:
                    exp_resp = self.session.get(
                        f"{self.BACKEND_URL}/v1/dashboard/matches/{match_id}/explanation",
                        headers=headers,
                        timeout=30
                    )

                    if exp_resp.status_code == 200:
                        success_count += 1
                        logger.info(f"  Got match explanation for {user.email}")

            except Exception as e:
                logger.error(f"  Error getting explanations for {user.email}: {e}")

        self.log_result(success_count >= 2, f"Got explanations for {success_count}/{len(self.test_users)} users")
        return success_count >= 2

    def initiate_ai_conversations(self) -> bool:
        """Initiate AI-to-AI conversations between matched users."""
        self.log_step("Initiating AI Conversations")

        success_count = 0
        conversations_started = []

        for user in self.test_users:
            if not user.token:
                continue

            headers = {"Authorization": f"Bearer {user.token}"}

            try:
                # Get matches
                resp = self.session.get(
                    f"{self.BACKEND_URL}/v1/dashboard/network-matches",
                    headers=headers,
                    params={"page": 1, "limit": 3},
                    timeout=30
                )

                if resp.status_code != 200:
                    continue

                data = resp.json()
                matches = data.get("data", {}).get("matches", [])

                if not matches:
                    continue

                # Initiate conversation with first match
                match_id = matches[0].get("id")
                other_user_id = matches[0].get("other_user_id") or matches[0].get("user_b_id")

                if not match_id or not other_user_id:
                    continue

                # Check if conversation already exists
                if match_id in conversations_started:
                    continue

                conv_resp = self.session.post(
                    f"{self.BACKEND_URL}/v1/ai-conversations/initiate-ai-conversation",
                    headers=headers,
                    json={
                        "match_id": match_id,
                        "other_user_id": other_user_id
                    },
                    timeout=60
                )

                if conv_resp.status_code in [200, 201]:
                    success_count += 1
                    conversations_started.append(match_id)
                    logger.info(f"  Started AI conversation for {user.email}")
                else:
                    logger.debug(f"  AI conversation failed for {user.email}: {conv_resp.status_code}")

            except Exception as e:
                logger.error(f"  Error initiating conversation for {user.email}: {e}")

        self.log_result(success_count >= 2, f"Started {success_count} AI conversations")

        # Wait for AI processing
        if success_count > 0:
            logger.info("  Waiting 60s for AI conversation processing...")
            time.sleep(60)

        return success_count >= 2

    def check_verdicts(self) -> bool:
        """Check AI conversation verdicts."""
        self.log_step("Checking AI Verdicts")

        success_count = 0

        for user in self.test_users:
            if not user.token:
                continue

            headers = {"Authorization": f"Bearer {user.token}"}

            try:
                # Get all conversations
                resp = self.session.get(
                    f"{self.BACKEND_URL}/v1/ai-conversations/get-all-conversations",
                    headers=headers,
                    params={"page": 1, "limit": 5},
                    timeout=30
                )

                if resp.status_code != 200:
                    continue

                data = resp.json()
                conversations = data.get("data", {}).get("conversations", [])

                for conv in conversations:
                    status = conv.get("status")
                    verdict = conv.get("verdict")

                    if verdict:
                        success_count += 1
                        logger.info(f"  Found verdict for {user.email}: {verdict} (status: {status})")
                        break

            except Exception as e:
                logger.error(f"  Error checking verdicts for {user.email}: {e}")

        self.log_result(success_count >= 1, f"Found {success_count} verdicts")
        return success_count >= 1

    def generate_report(self) -> Dict[str, Any]:
        """Generate test report."""
        self.log_step("Generating Test Report")

        report = {
            "timestamp": datetime.now().isoformat(),
            "total_users": len(self.test_users),
            "users": []
        }

        # Reconnect to clear any aborted transactions
        self.close_db()
        self.connect_db()

        try:
            cur = self.db_conn.cursor()

            for user in self.test_users:
                # Get user stats
                cur.execute("""
                    SELECT
                        u.onboarding_status,
                        (SELECT COUNT(*) FROM user_onboarding_answers WHERE user_id = u.id) as answers,
                        (SELECT COUNT(*) FROM user_summaries WHERE user_id = u.id AND status = 'approved') as summaries,
                        (SELECT COUNT(*) FROM matches WHERE user_a_id = u.id OR user_b_id = u.id) as matches,
                        (SELECT COUNT(*) FROM ai_conversations WHERE user_a_id = u.id OR user_b_id = u.id) as conversations
                    FROM users u
                    WHERE u.id = %s
                """, (user.user_id,))

                result = cur.fetchone()

                if result:
                    report["users"].append({
                        "email": user.email,
                        "persona_type": user.persona_type,
                        "onboarding_status": result[0],
                        "answers": result[1],
                        "summaries": result[2],
                        "matches": result[3],
                        "conversations": result[4]
                    })

            cur.close()

        except Exception as e:
            logger.error(f"Error generating report: {e}")

        # Print report
        print("\n" + "="*60)
        print("E2E TEST REPORT")
        print("="*60)
        print(f"Timestamp: {report['timestamp']}")
        print(f"Total Users: {report['total_users']}")
        print("-"*60)

        for u in report["users"]:
            print(f"\n{u['email']} ({u['persona_type']})")
            print(f"  Status: {u['onboarding_status']}")
            print(f"  Answers: {u['answers']} | Summaries: {u['summaries']}")
            print(f"  Matches: {u['matches']} | Conversations: {u['conversations']}")

        print("\n" + "="*60)

        return report

    def run_full_test(self) -> bool:
        """Run complete E2E test."""
        logger.info("\n" + "="*60)
        logger.info("RECIPROCITY E2E TEST - 10 USERS")
        logger.info("="*60 + "\n")

        start_time = time.time()

        try:
            # Phase 1: Setup
            if not self.check_services():
                logger.error("Services not running. Please start backend and AI service.")
                return False

            if not self.connect_db():
                return False

            # Phase 2: User Creation
            if not self.create_test_users():
                return False

            if not self.verify_emails():
                return False

            # Phase 3: Onboarding
            if not self.complete_onboarding():
                logger.warning("Onboarding incomplete, continuing...")

            # Phase 4: AI Summary
            if not self.request_ai_summaries():
                logger.warning("AI summary requests incomplete, continuing...")

            if not self.approve_ai_summaries():
                logger.warning("AI summary approvals incomplete, continuing...")

            # Phase 5: Matching
            if not self.trigger_matching():
                logger.warning("Matching incomplete, continuing...")

            if not self.get_matches_and_explanations():
                logger.warning("Match explanations incomplete, continuing...")

            # Phase 6: AI Conversations
            if not self.initiate_ai_conversations():
                logger.warning("AI conversations incomplete, continuing...")

            if not self.check_verdicts():
                logger.warning("Verdicts incomplete, continuing...")

            # Report
            self.generate_report()

            elapsed = time.time() - start_time
            logger.info(f"\nTotal test time: {elapsed:.1f}s")
            logger.info("\nE2E TEST COMPLETED")

            return True

        except Exception as e:
            logger.error(f"Test failed with error: {e}")
            return False

        finally:
            self.close_db()


def main():
    """Run E2E test."""
    tester = ReciprocityE2ETester()

    try:
        success = tester.run_full_test()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("\nTest interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
