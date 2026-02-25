'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('daily_analytics', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      signups: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      logins: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      onboarding_completed: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      summaries_created: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      personas_created: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      matches_total: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      matches_approved: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      matches_declined: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      matches_ai_rejected: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      matches_ai_accepted: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      conversations_ai_to_ai: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      conversations_user_to_user: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      perfect_matches: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
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

    await queryInterface.addIndex('daily_analytics', ['date'], {
      name: 'daily_analytics_date_idx',
      using: 'BTREE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('daily_analytics', 'daily_analytics_date_idx');
    await queryInterface.dropTable('daily_analytics');
  },
};
