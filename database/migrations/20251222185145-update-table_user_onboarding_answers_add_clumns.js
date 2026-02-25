'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add question_id column
    await queryInterface.addColumn('user_onboarding_answers', 'question_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'onboarding_questions', // table name
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // Add user_response column
    await queryInterface.addColumn('user_onboarding_answers', 'user_response', {
      type: Sequelize.TEXT,
      allowNull: true, // default is NULL
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove columns in reverse order
    await queryInterface.removeColumn('user_onboarding_answers', 'user_response');
    await queryInterface.removeColumn('user_onboarding_answers', 'question_id');
  },
};
