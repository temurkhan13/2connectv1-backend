'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Update column type of `ai_remarks` in `ai_conversations` table.
   * - Change: STRING → TEXT
   * - Reason: To allow longer AI-generated remarks content.
   */
  async up(queryInterface) {
    await queryInterface.changeColumn('ai_conversations', 'ai_remarks', {
      type: DataTypes.TEXT,
      allowNull: true, // keep consistent with existing null allowance
      // comment: 'AI remarks, now stored as TEXT to allow larger content',
    });
  },

  /**
   * Rollback: revert `ai_remarks` column type to TEXT.
   */
  async down(queryInterface) {
    await queryInterface.changeColumn('ai_conversations', 'ai_remarks', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  },
};
