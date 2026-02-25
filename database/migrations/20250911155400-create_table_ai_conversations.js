'use strict';

const { DataTypes } = require('sequelize');
const conversationStatusEnum = {
  OPEN: 'open',
  DELETED: 'deleted',
};
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('ai_conversations', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      user_a_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      user_b_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      user_a_feedback: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      user_b_feedback: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      match_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'matches',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      status: {
        type: DataTypes.ENUM(...Object.values(conversationStatusEnum)),
        allowNull: false,
        defaultValue: conversationStatusEnum.OPEN,
      },
      ai_remarks: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      compatibility_score: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      user_to_user_conversation: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
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

    await queryInterface.addIndex('ai_conversations', ['user_a_id'], {
      name: 'ai_conversations_user_a_id_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('ai_conversations', ['user_b_id'], {
      name: 'ai_conversations_user_b_id_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('ai_conversations', ['match_id'], {
      name: 'ai_conversations_match_id_idx',
      using: 'BTREE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('ai_conversations', 'ai_conversations_match_id_idx');
    await queryInterface.removeIndex('ai_conversations', 'ai_conversations_user_b_id_idx');
    await queryInterface.removeIndex('ai_conversations', 'ai_conversations_user_a_id_idx');
    await queryInterface.dropTable('ai_conversations');
  },
};
