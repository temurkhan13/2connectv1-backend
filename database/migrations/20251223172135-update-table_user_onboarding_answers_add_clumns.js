'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add user_response column
    await queryInterface.addColumn('user_onboarding_answers', 'display_order', {
      type: Sequelize.INTEGER,
      allowNull: true, // default is NULL
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove columns in reverse order
    await queryInterface.removeColumn('user_onboarding_answers', 'display_order');
  },
};
