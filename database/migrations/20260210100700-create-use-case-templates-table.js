'use strict';

/**
 * Phase 3.2: Use-Case Templates
 * Different AI prompts for fundraising, hiring, advisory, etc.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('use_case_templates', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      objective_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      display_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      ai_chat_system_prompt: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'System prompt for AI conversations with this objective',
      },
      success_criteria: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Criteria for evaluating conversation success',
      },
      key_questions: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: [],
        comment: 'Key questions the AI should explore',
      },
      verdict_criteria: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Criteria for match verdict',
      },
      match_weight_overrides: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Override default match weights for this use case',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    // Insert default templates
    await queryInterface.bulkInsert('use_case_templates', [
      {
        id: Sequelize.literal('gen_random_uuid()'),
        objective_code: 'fundraising',
        display_name: 'Fundraising',
        description: 'Connect founders with potential investors',
        ai_chat_system_prompt: 'You are facilitating a conversation between a founder seeking funding and a potential investor. Focus on: funding stage alignment, sector expertise, investment thesis fit, timeline compatibility, and terms expectations.',
        success_criteria: JSON.stringify({
          min_funding_discussion: true,
          timeline_alignment: true,
          mutual_interest_expressed: true,
        }),
        key_questions: ['What funding stage are you at?', 'What is your investment thesis?', 'What timeline are you working with?'],
        verdict_criteria: JSON.stringify({
          approved_threshold: 0.7,
          key_factors: ['funding_stage_match', 'sector_fit', 'timeline_alignment'],
        }),
        match_weight_overrides: JSON.stringify({
          objective_alignment: 0.35,
          industry_match: 0.30,
          timeline_compatibility: 0.20,
          experience_level: 0.15,
        }),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal('gen_random_uuid()'),
        objective_code: 'hiring',
        display_name: 'Hiring/Talent',
        description: 'Connect companies with potential hires or recruiters',
        ai_chat_system_prompt: 'You are facilitating a conversation about hiring needs. Focus on: role requirements, experience level, cultural fit, compensation expectations, and availability timeline.',
        success_criteria: JSON.stringify({
          role_clarity: true,
          skill_match_discussed: true,
          mutual_interest: true,
        }),
        key_questions: ['What role are you hiring for?', 'What experience level?', 'What is the compensation range?'],
        verdict_criteria: JSON.stringify({
          approved_threshold: 0.65,
          key_factors: ['skill_match', 'experience_level', 'availability'],
        }),
        match_weight_overrides: JSON.stringify({
          skill_complement: 0.35,
          experience_level: 0.25,
          timeline_compatibility: 0.20,
          communication_style: 0.20,
        }),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal('gen_random_uuid()'),
        objective_code: 'advisory',
        display_name: 'Advisory/Mentorship',
        description: 'Connect with advisors or mentors',
        ai_chat_system_prompt: 'You are facilitating a conversation about advisory relationships. Focus on: expertise areas, time commitment, compensation expectations, specific challenges to address, and communication preferences.',
        success_criteria: JSON.stringify({
          expertise_relevance: true,
          availability_discussed: true,
          clear_value_exchange: true,
        }),
        key_questions: ['What expertise are you seeking?', 'What time commitment works?', 'What challenges need addressing?'],
        verdict_criteria: JSON.stringify({
          approved_threshold: 0.6,
          key_factors: ['expertise_match', 'availability', 'communication_fit'],
        }),
        match_weight_overrides: JSON.stringify({
          skill_complement: 0.30,
          experience_level: 0.25,
          communication_style: 0.25,
          objective_alignment: 0.20,
        }),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal('gen_random_uuid()'),
        objective_code: 'partnership',
        display_name: 'Strategic Partnership',
        description: 'Connect for business partnerships and collaborations',
        ai_chat_system_prompt: 'You are facilitating a conversation about strategic partnerships. Focus on: complementary capabilities, shared goals, resource alignment, market overlap, and partnership structure.',
        success_criteria: JSON.stringify({
          mutual_benefit_identified: true,
          resource_discussion: true,
          next_steps_defined: true,
        }),
        key_questions: ['What capabilities are you looking to complement?', 'What markets are you targeting?', 'What resources can you contribute?'],
        verdict_criteria: JSON.stringify({
          approved_threshold: 0.7,
          key_factors: ['capability_complement', 'market_alignment', 'resource_fit'],
        }),
        match_weight_overrides: JSON.stringify({
          objective_alignment: 0.30,
          industry_match: 0.30,
          skill_complement: 0.25,
          timeline_compatibility: 0.15,
        }),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    // Add index for efficient lookup
    await queryInterface.addIndex('use_case_templates', ['objective_code'], {
      name: 'idx_use_case_templates_objective_code',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('use_case_templates');
  },
};
