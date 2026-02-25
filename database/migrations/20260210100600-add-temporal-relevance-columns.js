'use strict';

/**
 * Phase 3.1: Temporal Relevance
 * Adds urgency, need expiration, and activity tracking to user summaries
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add urgency column
    await queryInterface.addColumn('user_summaries', 'urgency', {
      type: Sequelize.ENUM('urgent', 'time_sensitive', 'ongoing', 'exploratory'),
      defaultValue: 'ongoing',
      allowNull: false,
    });

    // Add need expiration date
    await queryInterface.addColumn('user_summaries', 'need_expires_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Add last active timestamp
    await queryInterface.addColumn('user_summaries', 'last_active_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    });

    // Add freshness score (computed/cached)
    await queryInterface.addColumn('user_summaries', 'freshness_score', {
      type: Sequelize.DECIMAL(3, 2),
      allowNull: true,
      defaultValue: 1.0,
      comment: 'Decays over time, 1.0 = fresh, 0.0 = stale',
    });

    // Add index for efficient urgency filtering
    await queryInterface.addIndex('user_summaries', ['urgency', 'need_expires_at'], {
      name: 'idx_user_summaries_urgency_expires',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('user_summaries', 'idx_user_summaries_urgency_expires');
    await queryInterface.removeColumn('user_summaries', 'freshness_score');
    await queryInterface.removeColumn('user_summaries', 'last_active_at');
    await queryInterface.removeColumn('user_summaries', 'need_expires_at');
    await queryInterface.removeColumn('user_summaries', 'urgency');

    // Drop the ENUM type
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_user_summaries_urgency";'
    );
  },
};
