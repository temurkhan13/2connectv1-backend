'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add user_response column
    await queryInterface.addColumn('user_onboarding_answers', 'code', {
      type: Sequelize.STRING,
      allowNull: true, // default is NULL
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove columns in reverse order
    await queryInterface.removeColumn('user_onboarding_answers', 'code');
  },
};
