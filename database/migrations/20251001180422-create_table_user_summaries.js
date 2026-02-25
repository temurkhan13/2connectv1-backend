'use strict';

const { DataTypes } = require('sequelize');

const SummaryStatusEnum = {
  DRAFT: 'draft',
  APPROVED: 'approved',
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('user_summaries', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      status: {
        type: DataTypes.ENUM(...Object.values(SummaryStatusEnum)),
        allowNull: false,
      },
      summary: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      version: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },
      created_at: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex('user_summaries', ['user_id'], {
      name: 'user_summaries_user_id_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('user_summaries', ['version'], {
      name: 'user_summaries_version_idx',
      using: 'BTREE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('user_summaries', 'user_summaries_version_idx');
    await queryInterface.removeIndex('user_summaries', 'user_summaries_user_id_idx');
    await queryInterface.dropTable('user_summaries');
  },
};
