'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('onboarding_questions', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
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
      code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      prompt: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      narration: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      input_type: {
        type: DataTypes.STRING(30),
        allowNull: false,
      },
      comma_separated: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      options: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      suggestion_chips: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_required: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      display_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      has_nested_question: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      nested_question: {
        type: DataTypes.JSONB,
        allowNull: true,
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

    await queryInterface.addIndex('onboarding_questions', ['section_id'], {
      name: 'onboarding_questions_section_id_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('onboarding_questions', ['code'], {
      name: 'onboarding_questions_code_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('onboarding_questions', ['prompt'], {
      name: 'onboarding_questions_prompt_idx',
      using: 'BTREE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('onboarding_questions', 'onboarding_questions_prompt_idx');
    await queryInterface.removeIndex('onboarding_questions', 'onboarding_questions_code_idx');
    await queryInterface.removeIndex('onboarding_questions', 'onboarding_questions_section_id_idx');
    await queryInterface.dropTable('onboarding_questions');
  },
};
