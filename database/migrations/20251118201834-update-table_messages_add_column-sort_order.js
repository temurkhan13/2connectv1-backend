'use strict';

/**
 * Add sort_order column to messages table
 * ---------------------------------------
 * - INTEGER
 * - NOT NULL
 * - No default value needed because our code always sets it
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('messages', 'sort_order', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('messages', 'sort_order');
  },
};
