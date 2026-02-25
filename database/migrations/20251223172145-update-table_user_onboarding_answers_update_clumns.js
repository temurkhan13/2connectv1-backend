'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Change display_order from INTEGER to DOUBLE
    await queryInterface.changeColumn('user_onboarding_answers', 'display_order', {
      type: Sequelize.DOUBLE, // allows fractions like 1.1, 1.5, 2.25
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.changeColumn('onboarding_questions', 'display_order', {
      type: Sequelize.DOUBLE, // allows fractions like 1.1, 1.5, 2.25
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert back to INTEGER if needed
    await queryInterface.changeColumn('user_onboarding_answers', 'display_order', {
      type: Sequelize.DOUBLE,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn('onboarding_questions', 'display_order', {
      type: Sequelize.DOUBLE,
      allowNull: true,
      defaultValue: null,
    });
  },
};
