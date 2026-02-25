'use strict';

/**
 * Phase 4.3: Success Metrics Pipeline
 * Analytics events and funnel tracking tables
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create analytics_events table for raw event tracking
    await queryInterface.createTable('analytics_events', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      session_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Browser/app session identifier',
      },
      event_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'signup, onboarding_start, onboarding_complete, match_view, match_approve, ai_chat_start, ai_chat_complete, message_sent, etc.',
      },
      event_category: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'onboarding, matching, messaging, engagement',
      },
      event_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional event-specific data',
      },
      event_value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Numeric value for aggregation (e.g., time spent, score)',
      },
      source: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'web, mobile, api',
      },
      utm_source: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      utm_medium: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      utm_campaign: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Indexes for efficient querying
    await queryInterface.addIndex('analytics_events', ['event_type', 'created_at'], {
      name: 'idx_analytics_events_type_date',
    });
    await queryInterface.addIndex('analytics_events', ['user_id', 'created_at'], {
      name: 'idx_analytics_events_user_date',
    });
    await queryInterface.addIndex('analytics_events', ['event_category', 'created_at'], {
      name: 'idx_analytics_events_category_date',
    });

    // Create funnel_metrics table for aggregated funnel data
    await queryInterface.createTable('funnel_metrics', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      stage: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'signup, onboarding_started, onboarding_completed, first_match, first_approve, first_ai_chat, first_message, first_connection',
      },
      count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      unique_users: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      conversion_rate: {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: true,
        comment: 'Conversion rate from previous stage',
      },
      avg_time_from_previous_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Average time from previous funnel stage',
      },
      cohort_week: {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: 'YYYY-WW format for cohort analysis',
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

    // Unique constraint on date + stage
    await queryInterface.addConstraint('funnel_metrics', {
      fields: ['date', 'stage'],
      type: 'unique',
      name: 'uq_funnel_metrics_date_stage',
    });

    // Index for efficient date range queries
    await queryInterface.addIndex('funnel_metrics', ['date', 'stage'], {
      name: 'idx_funnel_metrics_date_stage',
    });
    await queryInterface.addIndex('funnel_metrics', ['cohort_week', 'stage'], {
      name: 'idx_funnel_metrics_cohort_stage',
    });

    // Create user_engagement_scores for per-user engagement tracking
    await queryInterface.createTable('user_engagement_scores', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      engagement_score: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '0-100 scale',
      },
      activity_level: {
        type: Sequelize.ENUM('dormant', 'low', 'medium', 'high', 'power_user'),
        allowNull: false,
        defaultValue: 'low',
      },
      days_since_last_activity: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      total_matches_received: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_matches_approved: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_ai_chats_completed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_messages_sent: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_connections_made: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      approval_rate: {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: true,
      },
      response_rate: {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: true,
      },
      avg_response_time_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      last_calculated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
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

    // Index for activity level filtering
    await queryInterface.addIndex('user_engagement_scores', ['activity_level', 'engagement_score'], {
      name: 'idx_user_engagement_activity_score',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('user_engagement_scores');
    await queryInterface.dropTable('funnel_metrics');
    await queryInterface.dropTable('analytics_events');

    // Drop ENUM types
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_user_engagement_scores_activity_level";'
    );
  },
};
