'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add user_input_response column
    await queryInterface.addColumn('user_onboarding_answers', 'user_input_response', {
      type: Sequelize.TEXT,
      allowNull: true, // default is NULL
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove columns in reverse order
    await queryInterface.removeColumn('user_onboarding_answers', 'user_input_response');
  },
};
