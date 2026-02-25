'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Phase 2.2: Add multi-vector scoring columns
   * - score_breakdown on matches: 6-dimension compatibility breakdown
   * - match_weights on users: User-customizable dimension weights
   */
  async up(queryInterface) {
    // Add score breakdown to matches
    await queryInterface.addColumn('matches', 'score_breakdown', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Multi-vector score breakdown: objective, industry, timeline, skills, experience, style',
    });

    // Add match weights to users for personalization
    await queryInterface.addColumn('users', 'match_weights', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        objective_alignment: 0.30,
        industry_match: 0.25,
        timeline_compatibility: 0.15,
        skill_complement: 0.15,
        experience_level: 0.10,
        communication_style: 0.05,
      },
      comment: 'User-customizable weights for match scoring dimensions',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'match_weights');
    await queryInterface.removeColumn('matches', 'score_breakdown');
  },
};
