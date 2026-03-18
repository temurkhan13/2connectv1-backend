'use strict';

/**
 * BUG-122 FIX: Add 'completed' status to ai_conversations status enum
 *
 * The AnalyticsService was querying for status='closed' which doesn't exist in the enum.
 * This migration adds 'completed' as a valid status value.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'completed' to the enum_ai_conversations_status type
    // PostgreSQL requires raw SQL to add values to an existing enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_ai_conversations_status" ADD VALUE IF NOT EXISTS 'completed';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't support removing values from an enum directly
    // This would require recreating the enum type which is complex and risky
    // For safety, we leave the 'completed' value in place on rollback
    console.log('Warning: Cannot remove enum value in PostgreSQL. The completed status will remain.');
  },
};
