'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Phase 2.3: Add match tier column
   * Categorizes matches as: perfect, strong, worth_exploring, low
   * Based on overall compatibility score
   */
  async up(queryInterface) {
    await queryInterface.addColumn('matches', 'match_tier', {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Match quality tier: perfect (85%+), strong (70-84%), worth_exploring (55-69%), low (<55%)',
    });

    // Add index for filtering by tier
    await queryInterface.addIndex('matches', ['match_tier'], {
      name: 'matches_match_tier_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('matches', 'matches_match_tier_idx');
    await queryInterface.removeColumn('matches', 'match_tier');
  },
};
