# Reciprocity Platform - User Monitoring Guide

**Last Updated:** 2026-03-03

---

## 🎯 Overview

This guide shows you how to monitor active users, identify issues, and debug problems on the Reciprocity/2Connect platform.

---

## 🚀 Quick Start

### Option 1: Python Monitoring Script (Recommended)

```bash
cd reciprocity-backend

# 1. Update credentials in scripts/monitor_users.py
# Edit lines 17-18:
# ADMIN_EMAIL = "your_admin@email.com"
# ADMIN_PASSWORD = "your_password"

# 2. Run commands
python scripts/monitor_users.py                    # Platform summary
python scripts/monitor_users.py --active           # Active users (24h)
python scripts/monitor_users.py --stuck            # Stuck onboarding
python scripts/monitor_users.py --user <email>     # Specific user details
python scripts/monitor_users.py --health           # System health check
python scripts/monitor_users.py --stats            # Onboarding statistics
```

### Option 2: Direct API Calls

```bash
# 1. Login to get JWT token
curl -X POST https://twoconnectv1-backend.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your_password"}'

# Response: { "result": { "access_token": "eyJhbGc..." } }

# 2. Use token in subsequent requests
export TOKEN="eyJhbGc..."

# 3. Get active users
curl -H "Authorization: Bearer $TOKEN" \
  "https://twoconnectv1-backend.onrender.com/api/v1/admin/users/list?page=1&limit=20"
```

---

## 📊 Available Monitoring Endpoints

### User Management

| Endpoint | Method | Description | Params |
|----------|--------|-------------|--------|
| `/admin/users/list` | GET | List all users with filters | `page`, `limit`, `onboarding_status`, `search` |
| `/admin/users/search` | GET | Search by name/email | `query` (required), `limit` |
| `/admin/users/:id` | GET | Full user details | User ID in path |
| `/admin/users/activity-logs` | GET | User activity timeline | `page`, `limit`, `user_id` |
| `/admin/users/change-activation` | PATCH | Enable/disable account | `user_id`, `is_active` |

### Dashboard & Analytics

| Endpoint | Method | Description | Params |
|----------|--------|-------------|--------|
| `/admin/dashboard/counts` | GET | Total users, active, summaries | - |
| `/admin/dashboard/user-signup-statistics` | GET | Signup trends | `visibility` (week/month) |
| `/admin/dashboard/user-onboarding-statistics` | GET | Onboarding breakdown | - |
| `/admin/dashboard/common-core-objectives` | GET | User objectives distribution | - |
| `/admin/dashboard/match-acceptance-rates` | GET | Match approval/rejection rates | `visibility` (week/month) |
| `/admin/dashboard/ai-conversation-success-metrics` | GET | AI chat success rates | `visibility` (week/month) |

### System Diagnostics

| Endpoint | Method | Description | Params |
|----------|--------|-------------|--------|
| `/dashboard/admin/system-health` | GET | AI service, onboarding, matching health | - |
| `/dashboard/admin/matching-diagnostics` | GET | Embeddings, matches, persona data | - |
| `/dashboard/admin/user-list` | GET | Admin user list | - |

---

## 🔍 Common Monitoring Scenarios

### 1. Check Who's Currently Testing

```bash
# See users active in last 24 hours
python scripts/monitor_users.py --active
```

**Output:**
```
Email                                    Name                      Status          Last Active
----------------------------------------------------------------------------------------------------
user1@example.com                       John Doe                  completed       2026-03-03 14:30
user2@example.com                       Jane Smith                in_progress     2026-03-03 14:15
```

### 2. Find Users Stuck in Onboarding

```bash
# See users who started onboarding >1 hour ago but haven't completed
python scripts/monitor_users.py --stuck
```

**Output:**
```
Email                                    Name                      Created             Duration (hrs)
----------------------------------------------------------------------------------------------------
stuck@example.com                       Bob Baker                 2026-03-03 10:00    4.5
```

**Common Reasons:**
- **Only 2 questions extracted** → Check `DISCLOSURE_BATCH_SIZE` env var (should be 5)
- **AI summary not generating** → Check `system-health` endpoint, verify webhook flag
- **Onboarding freezes** → Check browser console for errors, verify WebSocket connection

### 3. Debug Specific User Issues

```bash
# Get full details for a user
python scripts/monitor_users.py --user user@example.com
```

**Output:**
```
================================================================================
USER DETAILS
================================================================================

📧 Email: user@example.com
👤 Name: Test User
🆔 ID: 550e8400-e29b-41d4-a716-446655440000
📅 Created: 2026-03-03T10:00:00Z
🕐 Last Active: 2026-03-03T14:30:00Z

📊 Status:
  Onboarding: completed
  Account: Active

📝 AI Summary:
  Status: approved
  Version: 1
  Webhook: true

📄 Documents: 2
  - resume: resume.pdf
  - cover_letter: cover.pdf

🎯 Match Analytics:
  Total Matches: 5
  Approved: 3
  Rejected: 1
  Pending: 1
  Approval Rate: 75.0%
```

**What to Check:**
- **Onboarding stuck** → Look at `Status > Onboarding`
- **No AI summary** → Check `AI Summary > Webhook` (should be `true`)
- **No matches** → Check `Match Analytics > Total Matches` (if 0, check diagnostics)

### 4. System Health Check

```bash
# Check if all services are working
python scripts/monitor_users.py --health
```

**Output:**
```
================================================================================
SYSTEM HEALTH
================================================================================

🏥 Overall Status: HEALTHY
⏰ Timestamp: 2026-03-03T14:45:00Z

🤖 AI Service: HEALTHY
  ✅ persona_service: AI service is accessible
  ✅ embedding_service: Embedding service is accessible
  ✅ matching_service: Matching service is accessible

📝 Onboarding: HEALTHY
  ✅ question_extraction: Progressive disclosure is working
  ✅ slot_filling: Slot extraction is working

🎯 Matching: HEALTHY
  ✅ embedding_generation: Embeddings are being created
  ✅ match_generation: Matches are being generated
```

**If Status is WARNING/ERROR:**
- Check the `Issues` section at the bottom
- Common issues:
  - AI service unreachable → Check Render deployment status
  - Embedding service down → Check Celery workers
  - Match generation failing → Check DynamoDB connection

### 5. Onboarding Statistics

```bash
# See onboarding completion rates
python scripts/monitor_users.py --stats
```

**Output:**
```
📊 ONBOARDING STATISTICS

Status               Label                          Count
------------------------------------------------------------
not_started          Not Started                    5
in_progress          In Progress                    12
completed            Completed                      45
------------------------------------------------------------
TOTAL                                               62
```

---

## 🛠️ Troubleshooting Common Issues

### Issue: User sees only 2 questions during onboarding

**Root Cause:** `DISCLOSURE_BATCH_SIZE` environment variable too low

**Solution:**
1. Check current value in AI service deployment
2. Set to `5` (was `2` by default)
3. Restart AI service

**Verify Fix:**
```bash
# Check onboarding for a test user
curl -H "Authorization: Bearer $TOKEN" \
  "https://twoconnectv1-ai.onrender.com/api/v1/onboarding/chat" \
  -d '{"user_id":"test","message":"I want to raise funds"}'

# Response should have ~5 extracted slots
```

### Issue: AI summary shows blank content

**Root Cause 1:** Race condition (frontend fetches before backend updates)

**Solution:** Frontend already handles this with empty state

**Root Cause 2:** Persona generation task failed

**Solution:**
1. Check AI service logs in Render dashboard
2. Verify `webhook: true` is set in database:
   ```sql
   SELECT user_id, webhook, status FROM user_summaries WHERE user_id = 'xxx';
   ```
3. If `webhook` is `false/null`, backend fix is needed

**Verify Fix:**
```bash
# Check user summary
python scripts/monitor_users.py --user user@example.com

# Look for:
# AI Summary:
#   Webhook: true  ← Should be true
```

### Issue: No matches being generated

**Root Cause:** Missing embeddings or match service down

**Solution:**
1. Check matching diagnostics:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     "https://twoconnectv1-backend.onrender.com/api/v1/dashboard/admin/matching-diagnostics"
   ```

2. Look for:
   - `embeddings.count` should be > 0
   - `embeddings.has_basic` should be `true`
   - `matches.backend_count` shows match count

3. If embeddings are missing:
   - Trigger embedding generation manually
   - Check Celery worker logs
   - Verify DynamoDB connection

**Verify Fix:**
```bash
# Check user has embeddings
python scripts/monitor_users.py --user user@example.com

# Then check matching diagnostics endpoint
```

### Issue: User account stuck/frozen

**Root Cause:** Frontend error or WebSocket disconnect

**Solution:**
1. Check browser console (F12)
2. Verify WebSocket connection:
   ```javascript
   // In browser console
   console.log('WebSocket status:', window.socket?.connected);
   ```

3. If disconnected, refresh page
4. If persists, check backend realtime gateway logs

**Verify Fix:**
- User can navigate between pages
- Changes save successfully
- Notifications appear

---

## 🔔 Real-Time Monitoring (WebSocket)

### Connect to WebSocket

```javascript
// In browser console or test script
const socket = io('https://twoconnectv1-backend.onrender.com', {
  path: '/ws/socket.io',
  auth: { token: 'YOUR_JWT_TOKEN' }
});

socket.on('connected', (data) => {
  console.log('Connected:', data);
});

socket.on('summary.ready', (data) => {
  console.log('AI Summary ready for user:', data);
});

socket.on('match.found', (data) => {
  console.log('New match found:', data);
});
```

### Available WebSocket Events

| Event | Trigger | Data |
|-------|---------|------|
| `connected` | User connects | `{ userId }` |
| `summary.ready` | AI summary generated | `{ userId }` |
| `onboarding.complete` | Onboarding finished | `{ userId }` |
| `match.found` | New match created | `{ userId, matchId }` |

---

## 📈 Analytics & Metrics

### Funnel Analysis

**Endpoint:** `/analytics/funnel`

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://twoconnectv1-backend.onrender.com/api/v1/analytics/funnel?start_date=2026-03-01&end_date=2026-03-03"
```

**Response:**
```json
{
  "stages": [
    { "stage": "signup", "count": 100, "conversion_rate": null },
    { "stage": "onboarding_started", "count": 85, "conversion_rate": 85.0 },
    { "stage": "onboarding_completed", "count": 60, "conversion_rate": 70.6 },
    { "stage": "first_match", "count": 45, "conversion_rate": 75.0 }
  ],
  "overall_conversion": 45.0
}
```

### User Engagement

**Endpoint:** `/analytics/engagement`

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://twoconnectv1-backend.onrender.com/api/v1/analytics/engagement"
```

**Response:**
```json
{
  "engagement_score": 75,
  "activity_level": "high",
  "days_since_last_activity": 0,
  "total_matches_received": 10,
  "total_matches_approved": 7,
  "approval_rate": 70.0
}
```

---

## 🔐 Admin Account Setup

### Create Admin Account

1. **Via Database (Supabase):**
   ```sql
   UPDATE users
   SET role = 'admin'
   WHERE email = 'your_email@example.com';
   ```

2. **Via API (if endpoint exists):**
   ```bash
   curl -X POST https://twoconnectv1-backend.onrender.com/api/v1/auth/create-admin \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"secure_password"}'
   ```

### Update Monitoring Script Credentials

Edit `scripts/monitor_users.py`:
```python
# Line 17-18
ADMIN_EMAIL = "your_admin@example.com"  # Your admin email
ADMIN_PASSWORD = "your_secure_password"  # Your admin password
```

---

## 📊 Database Queries (Supabase)

### Check User Onboarding Progress

```sql
SELECT
  email,
  onboarding_status,
  created_at,
  last_active_at
FROM users
WHERE onboarding_status = 'in_progress'
ORDER BY created_at DESC;
```

### Check AI Summary Generation

```sql
SELECT
  us.user_id,
  u.email,
  us.webhook,
  us.status,
  us.created_at
FROM user_summaries us
JOIN users u ON u.id = us.user_id
ORDER BY us.created_at DESC
LIMIT 20;
```

### Check Match Statistics

```sql
SELECT
  u.email,
  COUNT(m.id) as total_matches,
  SUM(CASE WHEN m.status = 'approved' THEN 1 ELSE 0 END) as approved,
  SUM(CASE WHEN m.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
  SUM(CASE WHEN m.status = 'pending' THEN 1 ELSE 0 END) as pending
FROM users u
LEFT JOIN matches m ON m.user_id = u.id
GROUP BY u.email
ORDER BY total_matches DESC;
```

---

## 🚨 Alert Triggers

Set up monitoring alerts for:

1. **High stuck onboarding rate** (>20% in progress >1 hour)
2. **Low AI summary generation** (<90% success rate)
3. **System health WARNING/ERROR** status
4. **Zero matches generated** for >24 hours
5. **High user abandonment** (>50% drop-off in funnel)

**Implementation Options:**
- Render auto-alerting (built-in)
- Custom script with email notifications
- Slack/Discord webhooks
- Uptime monitoring (e.g., UptimeRobot)

---

## 📝 Logging Locations

### Backend Logs (Render)
- **URL:** https://dashboard.render.com/
- **Service:** reciprocity-backend
- **View:** Logs tab
- **Filter:** Search for user email or error messages

### AI Service Logs (Render)
- **URL:** https://dashboard.render.com/
- **Service:** reciprocity-ai
- **View:** Logs tab
- **Filter:** Search for "persona generation" or "embedding"

### Frontend Logs (Vercel)
- **URL:** https://vercel.com/dashboard
- **Project:** reciprocity-frontend
- **View:** Deployments → Runtime Logs
- **Note:** Limited to build-time and serverless function logs

### Browser Console (Frontend)
- Press F12 in browser
- Check Console tab for errors
- Check Network tab for failed API requests
- Check Application → Local Storage for stuck state

---

## 🎯 Next Steps

1. **Update admin credentials** in `monitor_users.py`
2. **Run health check** to verify all services
3. **Set up alerts** for critical issues
4. **Monitor onboarding stats** during testing
5. **Check active users** during test sessions

---

## 📚 Additional Resources

- [Backend API Documentation](https://twoconnectv1-backend.onrender.com/api/docs) (Swagger)
- [Render Dashboard](https://dashboard.render.com/)
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [DynamoDB Console](https://console.aws.amazon.com/dynamodbv2/)

---

## ⚠️ Important Notes

1. **Admin access required** for all monitoring endpoints
2. **JWT tokens expire** after 1 hour (re-login if needed)
3. **Rate limiting** may apply to API calls (respect limits)
4. **Production data** - Be careful when modifying user records
5. **Privacy** - User data is sensitive, handle securely

---

## 🐛 Report Issues

If you find monitoring gaps or need additional tools:
1. Document the use case
2. Specify what data you need
3. Create enhancement request
4. Update this guide once implemented
