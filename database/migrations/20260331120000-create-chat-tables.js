'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Chat Conversations table
    await queryInterface.createTable('chat_conversations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user1_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      user2_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      match_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Reference to the match that initiated this conversation',
      },
      last_message_at: {
        type: Sequelize.DATE,
        allowNull: true,
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

    // Unique constraint: one conversation per user pair
    await queryInterface.addIndex('chat_conversations', ['user1_id', 'user2_id'], {
      unique: true,
      name: 'unique_conversation_pair',
    });

    // Index for querying user's conversations
    await queryInterface.addIndex('chat_conversations', ['user1_id']);
    await queryInterface.addIndex('chat_conversations', ['user2_id']);
    await queryInterface.addIndex('chat_conversations', ['last_message_at']);

    // 2. Chat Messages table
    await queryInterface.createTable('chat_messages', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'chat_conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      sender_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      message_type: {
        type: Sequelize.ENUM('text', 'image', 'system'),
        allowNull: false,
        defaultValue: 'text',
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the recipient read this message. NULL = unread.',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Index for querying messages in a conversation (most recent first)
    await queryInterface.addIndex('chat_messages', ['conversation_id', 'created_at']);

    // Index for unread count queries
    await queryInterface.addIndex('chat_messages', ['conversation_id', 'sender_id', 'read_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('chat_messages');
    await queryInterface.dropTable('chat_conversations');
  },
};
