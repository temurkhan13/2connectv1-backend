'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Phase 1.3: Add rich verdict columns to ai_conversations table
   * Enhances the basic Accept/Decline verdict with detailed analysis
   */
  async up(queryInterface) {
    await queryInterface.addColumn('ai_conversations', 'verdict_details', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Detailed verdict with synergy areas, friction points, risk factors',
    });

    await queryInterface.addColumn('ai_conversations', 'synergy_areas', {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      defaultValue: [],
      comment: 'Specific ways users can help each other',
    });

    await queryInterface.addColumn('ai_conversations', 'friction_points', {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      defaultValue: [],
      comment: 'Potential challenges identified in conversation',
    });

    await queryInterface.addColumn('ai_conversations', 'suggested_topics', {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      defaultValue: [],
      comment: 'Topics users should discuss in their real chat',
    });

    await queryInterface.addColumn('ai_conversations', 'recommended_next_step', {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'AI recommended next action (e.g., "Schedule a 30-min call")',
    });

    await queryInterface.addColumn('ai_conversations', 'confidence_level', {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      comment: 'AI confidence in the verdict (0.00-1.00)',
    });

    await queryInterface.addColumn('ai_conversations', 'ice_breaker', {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Personalized conversation starter based on the AI chat',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('ai_conversations', 'ice_breaker');
    await queryInterface.removeColumn('ai_conversations', 'confidence_level');
    await queryInterface.removeColumn('ai_conversations', 'recommended_next_step');
    await queryInterface.removeColumn('ai_conversations', 'suggested_topics');
    await queryInterface.removeColumn('ai_conversations', 'friction_points');
    await queryInterface.removeColumn('ai_conversations', 'synergy_areas');
    await queryInterface.removeColumn('ai_conversations', 'verdict_details');
  },
};
