'use strict';

const { DataTypes } = require('sequelize');

const MatchStatusEnum = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('matches', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      batch_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'match_batches',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
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
      user_a_persona_compatibility_score: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      user_b_persona_compatibility_score: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      user_a_decision: {
        type: DataTypes.ENUM(...Object.values(MatchStatusEnum)),
        allowNull: true,
      },
      user_b_decision: {
        type: DataTypes.ENUM(...Object.values(MatchStatusEnum)),
        allowNull: true,
      },
      user_a_designation: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      user_b_designation: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      user_a_objective: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      user_b_objective: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      ai_remarks_after_chat: {
        type: DataTypes.ENUM(...Object.values(MatchStatusEnum)),
        allowNull: true,
      },
      user_to_user_conversation: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ENUM(...Object.values(MatchStatusEnum)),
        defaultValue: MatchStatusEnum.PENDING,
      },
      perfect_match: {
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

    await queryInterface.addIndex('matches', ['batch_id'], {
      name: 'matches_batch_id_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('matches', ['user_a_id'], {
      name: 'matches_user_a_id_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('matches', ['user_b_id'], {
      name: 'matches_user_b_id_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('matches', ['perfect_match'], {
      name: 'matches_perfect_match_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('matches', ['status'], {
      name: 'matches_status_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('matches', ['user_a_decision'], {
      name: 'matches_user_a_decision_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('matches', ['user_b_decision'], {
      name: 'matches_user_b_decision_idx',
      using: 'BTREE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('matches', 'matches_user_b_decision_idx');
    await queryInterface.removeIndex('matches', 'matches_user_a_decision_idx');
    await queryInterface.removeIndex('matches', 'matches_status_idx');
    await queryInterface.removeIndex('matches', 'matches_perfect_match_idx');
    await queryInterface.removeIndex('matches', 'matches_user_b_id_idx');
    await queryInterface.removeIndex('matches', 'matches_user_a_id_idx');
    await queryInterface.removeIndex('matches', 'matches_batch_id_idx');
    await queryInterface.dropTable('matches');
  },
};
