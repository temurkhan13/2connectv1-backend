-- Reciprocity Platform: Duplicate Match Cleanup Script
-- Date: 2026-02-27
-- Purpose: Remove duplicate matches before unique constraint can be enforced
--
-- IMPORTANT: Run this BEFORE applying the unique constraint migration
-- The unique constraint in match.entity.ts won't apply if duplicates exist

-- ============================================
-- STEP 1: Preview duplicates (read-only)
-- ============================================

SELECT
    'DUPLICATES FOUND' as status,
    LEAST(user_a_id, user_b_id) as user_pair_1,
    GREATEST(user_a_id, user_b_id) as user_pair_2,
    COUNT(*) as duplicate_count,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM matches
GROUP BY LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id)
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- ============================================
-- STEP 2: Count total duplicates to remove
-- ============================================

SELECT
    COUNT(*) as total_duplicate_records_to_delete
FROM (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id)
               ORDER BY created_at ASC
           ) as rn
    FROM matches
) sub
WHERE rn > 1;

-- ============================================
-- STEP 3: DELETE DUPLICATES (DESTRUCTIVE!)
-- Keeps the OLDEST record for each user pair
-- ============================================

-- Uncomment the following to actually run the deletion:

/*
BEGIN;

DELETE FROM matches
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id)
                   ORDER BY created_at ASC
               ) as rn
        FROM matches
    ) sub
    WHERE rn > 1
);

-- Verify no duplicates remain
SELECT
    CASE
        WHEN COUNT(*) = 0 THEN 'SUCCESS: No duplicates remain'
        ELSE 'ERROR: ' || COUNT(*) || ' duplicate pairs still exist'
    END as cleanup_result
FROM (
    SELECT LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id)
    FROM matches
    GROUP BY LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id)
    HAVING COUNT(*) > 1
) sub;

COMMIT;
*/

-- ============================================
-- STEP 4: Verify unique constraint can be applied
-- ============================================

-- After cleanup, this should return 0:
SELECT COUNT(*) as remaining_duplicates
FROM (
    SELECT LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id)
    FROM matches
    GROUP BY LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id)
    HAVING COUNT(*) > 1
) sub;

-- ============================================
-- ALTERNATIVE: Keep NEWEST instead of oldest
-- ============================================

-- If you want to keep the most recent match instead:
/*
DELETE FROM matches
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id)
                   ORDER BY created_at DESC  -- DESC = keep newest
               ) as rn
        FROM matches
    ) sub
    WHERE rn > 1
);
*/
