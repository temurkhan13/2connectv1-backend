'use strict';

/**
 * Phase 3.3: Interactive Search/Browse (Discovery System)
 * Anonymous profiles and connection interests for proactive discovery
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create connection_interests table for expressing interest
    await queryInterface.createTable('connection_interests', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      from_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      to_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('pending', 'mutual', 'declined', 'expired'),
        allowNull: false,
        defaultValue: 'pending',
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional message with interest expression',
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Interest expires after 7 days if not mutual',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Unique constraint: one interest per user pair direction
    await queryInterface.addConstraint('connection_interests', {
      fields: ['from_user_id', 'to_user_id'],
      type: 'unique',
      name: 'uq_connection_interests_user_pair',
    });

    // Indexes for efficient queries
    await queryInterface.addIndex('connection_interests', ['from_user_id', 'status'], {
      name: 'idx_connection_interests_from_status',
    });
    await queryInterface.addIndex('connection_interests', ['to_user_id', 'status'], {
      name: 'idx_connection_interests_to_status',
    });

    // Create browse_history for tracking profile views
    await queryInterface.createTable('browse_history', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      viewer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      viewed_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      view_duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      source: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'search, recommendation, browse, etc.',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Index for analytics
    await queryInterface.addIndex('browse_history', ['viewer_id', 'created_at'], {
      name: 'idx_browse_history_viewer_date',
    });
    await queryInterface.addIndex('browse_history', ['viewed_user_id', 'created_at'], {
      name: 'idx_browse_history_viewed_date',
    });

    // Create anonymous_profiles materialized view for search
    // Note: This creates a view, not a materialized view, for broader compatibility
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW anonymous_profiles AS
      SELECT
        u.id,
        CONCAT('Member #', SUBSTR(u.id::text, 1, 8)) as display_name,
        us.summary as profile_summary,
        u.onboarding_status,
        us.urgency,
        us.freshness_score,
        (
          SELECT array_agg(DISTINCT uoa.answer->>'text')
          FROM user_onboarding_answers uoa
          WHERE uoa.user_id = u.id
          AND uoa.answer->>'text' IS NOT NULL
          LIMIT 5
        ) as objectives,
        u.created_at as member_since,
        us.last_active_at
      FROM users u
      LEFT JOIN user_summaries us ON us.user_id = u.id
      WHERE u.onboarding_status = 'completed'
      AND u.is_active = true;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS anonymous_profiles;');
    await queryInterface.dropTable('browse_history');
    await queryInterface.dropTable('connection_interests');

    // Drop the ENUM type
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_connection_interests_status";'
    );
  },
};
