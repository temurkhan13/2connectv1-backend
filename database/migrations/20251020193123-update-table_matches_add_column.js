'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Add `ai_to_ai_conversation` boolean column to `matches`.
   * - default: false
   * - not null (safe default covers existing rows)
   */
  async up(queryInterface) {
    await queryInterface.addColumn('matches', 'ai_to_ai_conversation', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      // comment: 'Whether user has onboarding matches enabled',
    });
  },

  /**
   * Rollback: remove `ai_to_ai_conversation` column from `matches`.
   */
  async down(queryInterface) {
    await queryInterface.removeColumn('matches', 'ai_to_ai_conversation');
  },
};
