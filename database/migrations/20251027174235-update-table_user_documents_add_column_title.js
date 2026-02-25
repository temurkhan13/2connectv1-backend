'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Add `title` column to `user_documents` table.
   * - Type: STRING
   * - Nullable: true (safe for existing rows)
   */
  async up(queryInterface) {
    await queryInterface.addColumn('user_documents', 'title', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      // comment: 'Title or label for the uploaded document',
    });
  },

  /**
   * Rollback: remove `title` column from `user_documents`.
   */
  async down(queryInterface) {
    await queryInterface.removeColumn('user_documents', 'title');
  },
};
