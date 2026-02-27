'use strict';

/**
 * Migration: Cleanup Duplicate Matches
 *
 * This migration:
 * 1. Removes duplicate matches (keeps oldest for each user pair)
 * 2. Adds unique constraint on (user_a_id, user_b_id)
 *
 * Note: The unique constraint is also defined in match.entity.ts but
 * this migration ensures it's applied to existing data safely.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Step 1: Count duplicates before cleanup
      const [duplicateCount] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM (
          SELECT LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id)
          FROM matches
          GROUP BY LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id)
          HAVING COUNT(*) > 1
        ) sub`,
        { transaction }
      );
      console.log(`Found ${duplicateCount[0]?.count || 0} duplicate match pairs`);

      // Step 2: Delete duplicate matches, keeping the oldest
      const [deleteResult] = await queryInterface.sequelize.query(
        `DELETE FROM matches
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
        )`,
        { transaction }
      );
      console.log('Duplicate matches cleaned up');

      // Step 3: Add unique constraint (if not exists)
      // First check if constraint already exists
      const [existingConstraints] = await queryInterface.sequelize.query(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_name = 'matches' AND constraint_name = 'matches_user_pair_unique'`,
        { transaction }
      );

      if (existingConstraints.length === 0) {
        await queryInterface.addConstraint('matches', {
          fields: ['user_a_id', 'user_b_id'],
          type: 'unique',
          name: 'matches_user_pair_unique',
          transaction
        });
        console.log('Added unique constraint matches_user_pair_unique');
      } else {
        console.log('Unique constraint matches_user_pair_unique already exists');
      }

      await transaction.commit();
      console.log('Migration completed successfully');
    } catch (error) {
      await transaction.rollback();
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove the unique constraint (cannot restore deleted duplicates)
    try {
      await queryInterface.removeConstraint('matches', 'matches_user_pair_unique');
      console.log('Removed unique constraint matches_user_pair_unique');
    } catch (error) {
      console.log('Constraint may not exist:', error.message);
    }
  }
};
