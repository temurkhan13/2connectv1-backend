'use strict';

const { DataTypes } = require('sequelize');
const MatchBatchStatusEnum = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('match_batches', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(...Object.values(MatchBatchStatusEnum)),
        allowNull: false,
        defaultValue: MatchBatchStatusEnum.DRAFT,
      },
      match_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      created_at: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex('match_batches', ['match_date'], {
      name: 'match_batches_match_date_idx',
      using: 'BTREE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('match_batches', 'match_batches_match_date_idx');
    await queryInterface.dropTable('match_batches');
  },
};
