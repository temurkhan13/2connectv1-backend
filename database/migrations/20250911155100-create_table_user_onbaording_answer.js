'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('user_onboarding_answers', {
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
      section_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'onboarding_sections',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      answer: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex('user_onboarding_answers', ['user_id'], {
      name: 'user_onboarding_answers_user_id_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('user_onboarding_answers', ['section_id'], {
      name: 'user_onboarding_answers_section_id_idx',
      using: 'BTREE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'user_onboarding_answers',
      'user_onboarding_answers_section_id_idx',
    );
    await queryInterface.removeIndex(
      'user_onboarding_answers',
      'user_onboarding_answers_user_id_idx',
    );
    await queryInterface.dropTable('user_onboarding_answers');
  },
};
