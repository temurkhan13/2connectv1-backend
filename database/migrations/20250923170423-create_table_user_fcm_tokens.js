'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('user_fcm_tokens', {
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
      tokens: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: null,
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

    await queryInterface.addIndex('user_fcm_tokens', ['user_id'], {
      name: 'user_fcm_tokens_user_id_idx',
      using: 'BTREE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('user_fcm_tokens', 'user_fcm_tokens_user_id_idx');
    await queryInterface.dropTable('user_fcm_tokens');
  },
};
