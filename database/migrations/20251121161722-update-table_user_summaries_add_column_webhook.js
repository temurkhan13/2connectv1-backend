'use strict';

/**
 * Add webhook column to user_summaries table
 * ---------------------------------------
 * - BOOLEAN
 * - NOT NULL
 * - default true
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('user_summaries', 'webhook', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('user_summaries', 'webhook');
  },
};
