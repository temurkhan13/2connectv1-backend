'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('user_activity_logs', {
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
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      event_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      event_time: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex('user_activity_logs', ['user_id'], {
      name: 'user_activity_logs_user_id_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('user_activity_logs', ['event_time'], {
      name: 'user_activity_logs_event_time_idx',
      using: 'BTREE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('user_activity_logs', 'user_activity_logs_event_time_idx');
    await queryInterface.removeIndex('user_activity_logs', 'user_activity_logs_user_id_idx');

    await queryInterface.dropTable('user_activity_logs');
  },
};
