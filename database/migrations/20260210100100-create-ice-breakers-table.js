'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Phase 1.2: Create ice_breakers table for guided first messages
   * Stores AI-generated conversation starters for each match/user pair
   */
  async up(queryInterface) {
    await queryInterface.createTable('ice_breakers', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
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
      suggestions: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: false,
        comment: 'Array of AI-generated conversation starters',
      },
      selected_suggestion: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Index of the suggestion the user selected (for analytics)',
      },
      used_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the user actually used an ice breaker',
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

    // Composite unique index - one set of ice breakers per match/user
    await queryInterface.addIndex('ice_breakers', ['match_id', 'user_id'], {
      name: 'ice_breakers_match_user_unique',
      unique: true,
    });

    await queryInterface.addIndex('ice_breakers', ['match_id'], {
      name: 'ice_breakers_match_id_idx',
    });

    await queryInterface.addIndex('ice_breakers', ['user_id'], {
      name: 'ice_breakers_user_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('ice_breakers', 'ice_breakers_user_id_idx');
    await queryInterface.removeIndex('ice_breakers', 'ice_breakers_match_id_idx');
    await queryInterface.removeIndex('ice_breakers', 'ice_breakers_match_user_unique');
    await queryInterface.dropTable('ice_breakers');
  },
};
