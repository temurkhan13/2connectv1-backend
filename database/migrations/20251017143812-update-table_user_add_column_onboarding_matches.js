'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Add `onboarding_matches` boolean column to `users`.
   * - default: false
   * - not null (safe default covers existing rows)
   */
  async up(queryInterface) {
    await queryInterface.addColumn('users', 'onboarding_matches', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      // comment: 'Whether user has onboarding matches enabled',
    });
  },

  /**
   * Rollback: remove `onboarding_matches` column from `users`.
   */
  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'onboarding_matches');
  },
};
