'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Phase 1.1: Add match explanation columns to matches table
   * - explanation: JSONB containing primary alignment, what each user offers/needs
   * - synergy_areas: Array of synergy points
   * - friction_points: Array of potential challenges
   * - talking_points: Array of suggested discussion topics
   */
  async up(queryInterface) {
    await queryInterface.addColumn('matches', 'explanation', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'AI-generated explanation of why users matched',
    });

    await queryInterface.addColumn('matches', 'synergy_areas', {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      defaultValue: [],
      comment: 'List of synergy points between users',
    });

    await queryInterface.addColumn('matches', 'friction_points', {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      defaultValue: [],
      comment: 'List of potential challenges or misalignments',
    });

    await queryInterface.addColumn('matches', 'talking_points', {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      defaultValue: [],
      comment: 'Suggested topics for initial conversation',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('matches', 'talking_points');
    await queryInterface.removeColumn('matches', 'friction_points');
    await queryInterface.removeColumn('matches', 'synergy_areas');
    await queryInterface.removeColumn('matches', 'explanation');
  },
};
