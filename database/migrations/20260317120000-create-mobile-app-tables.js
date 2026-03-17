'use strict';

/**
 * Mobile App Backend Requirements
 * Creates tables for push notifications and notification settings
 *
 * Tables:
 * - push_tokens: Stores Expo push notification tokens per device
 * - notification_settings: User notification preferences
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create push_tokens table for Expo push notifications
    await queryInterface.createTable('push_tokens', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      token: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Expo push token (ExponentPushToken[xxx])',
      },
      platform: {
        type: Sequelize.ENUM('ios', 'android'),
        allowNull: false,
      },
      device_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Unique device identifier',
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last time a notification was sent to this token',
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

    // Unique constraint: one token per user+device combination
    await queryInterface.addConstraint('push_tokens', {
      fields: ['user_id', 'device_id'],
      type: 'unique',
      name: 'uq_push_tokens_user_device',
    });

    // Index for finding all tokens for a user
    await queryInterface.addIndex('push_tokens', ['user_id'], {
      name: 'idx_push_tokens_user_id',
    });

    // Create notification_settings table
    await queryInterface.createTable('notification_settings', {
      user_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      push_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Master switch for push notifications',
      },
      email_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Master switch for email notifications',
      },
      match_notifications: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Receive notifications for new matches',
      },
      message_notifications: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Receive notifications for new messages',
      },
      weekly_digest: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Receive weekly digest email',
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('notification_settings');
    await queryInterface.dropTable('push_tokens');

    // Drop the ENUM type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_push_tokens_platform";');
  },
};
