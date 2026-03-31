'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Events table
    await queryInterface.createTable('events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      event_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      event_end_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      venue: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      country: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      logo_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      access_code: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      max_participants: {
        type: Sequelize.INTEGER,
        defaultValue: 500,
      },
      status: {
        type: Sequelize.STRING(20),
        defaultValue: 'upcoming',
        comment: 'upcoming | active | ended | cancelled',
      },
      organiser_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      organiser_email: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // 2. Event Participants table
    await queryInterface.createTable('event_participants', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      event_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'events', key: 'id' },
        onDelete: 'CASCADE',
      },
      goals: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: [],
      },
      joined_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Unique constraint: one entry per user per event
    await queryInterface.addConstraint('event_participants', {
      fields: ['user_id', 'event_id'],
      type: 'unique',
      name: 'uq_event_participants_user_event',
    });

    // Index for fast lookups by event
    await queryInterface.addIndex('event_participants', ['event_id'], {
      name: 'idx_event_participants_event_id',
    });

    // 3. Event Match Badges table
    await queryInterface.createTable('event_match_badges', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      event_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'events', key: 'id' },
        onDelete: 'CASCADE',
      },
      match_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'matches', key: 'id' },
        onDelete: 'CASCADE',
      },
      goal_complementary: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Unique constraint: one badge per event per match
    await queryInterface.addConstraint('event_match_badges', {
      fields: ['event_id', 'match_id'],
      type: 'unique',
      name: 'uq_event_match_badges_event_match',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('event_match_badges');
    await queryInterface.dropTable('event_participants');
    await queryInterface.dropTable('events');
  },
};
