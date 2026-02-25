'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Phase 2.1: Create tables for feedback learning loop
   * - match_feedback: Records each match decision with reasons
   * - user_preferences_learned: Stores learned patterns from feedback
   */
  async up(queryInterface) {
    // Table 1: Match feedback with reasons
    await queryInterface.createTable('match_feedback', {
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
      decision: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'approved or declined',
      },
      reason_tags: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: true,
        defaultValue: [],
        comment: 'Structured reason tags (e.g., wrong_industry, not_relevant)',
      },
      reason_text: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Free-text explanation from user',
      },
      decision_time_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Time taken to make decision (for engagement analysis)',
      },
      other_user_attributes: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Snapshot of other user profile attributes at decision time',
      },
      created_at: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex('match_feedback', ['user_id'], {
      name: 'match_feedback_user_id_idx',
    });

    await queryInterface.addIndex('match_feedback', ['match_id'], {
      name: 'match_feedback_match_id_idx',
    });

    await queryInterface.addIndex('match_feedback', ['decision'], {
      name: 'match_feedback_decision_idx',
    });

    await queryInterface.addIndex('match_feedback', ['created_at'], {
      name: 'match_feedback_created_at_idx',
    });

    // Table 2: Learned user preferences
    await queryInterface.createTable('user_preferences_learned', {
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
      preference_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Type of preference (industry, role, seniority, etc.)',
      },
      positive_patterns: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Patterns from approved matches',
      },
      negative_patterns: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Patterns from declined matches',
      },
      confidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: true,
        defaultValue: 0.5,
        comment: 'Confidence in learned patterns (0.00-1.00)',
      },
      sample_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: 'Number of feedback samples used for learning',
      },
      last_trained_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When preferences were last retrained',
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

    // Unique constraint: one preference type per user
    await queryInterface.addIndex('user_preferences_learned', ['user_id', 'preference_type'], {
      name: 'user_preferences_user_type_unique',
      unique: true,
    });

    await queryInterface.addIndex('user_preferences_learned', ['user_id'], {
      name: 'user_preferences_user_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('user_preferences_learned', 'user_preferences_user_id_idx');
    await queryInterface.removeIndex('user_preferences_learned', 'user_preferences_user_type_unique');
    await queryInterface.dropTable('user_preferences_learned');

    await queryInterface.removeIndex('match_feedback', 'match_feedback_created_at_idx');
    await queryInterface.removeIndex('match_feedback', 'match_feedback_decision_idx');
    await queryInterface.removeIndex('match_feedback', 'match_feedback_match_id_idx');
    await queryInterface.removeIndex('match_feedback', 'match_feedback_user_id_idx');
    await queryInterface.dropTable('match_feedback');
  },
};
