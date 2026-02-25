'use strict';

module.exports = {
  async up(queryInterface) {
    // Make section_id nullable
    await queryInterface.sequelize.query(`
      ALTER TABLE "user_onboarding_answers"
      ALTER COLUMN "section_id" DROP NOT NULL;
    `);

    // Make answer nullable
    await queryInterface.sequelize.query(`
      ALTER TABLE "user_onboarding_answers"
      ALTER COLUMN "answer" DROP NOT NULL;
    `);
  },

  async down(queryInterface) {
    /**
     * Revert to NOT NULL
     * NOTE: This will FAIL if any rows contain NULL values.
     * Clean them before running down.
     */
    await queryInterface.sequelize.query(`
      ALTER TABLE "user_onboarding_answers"
      ALTER COLUMN "section_id" SET NOT NULL;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "user_onboarding_answers"
      ALTER COLUMN "answer" SET NOT NULL;
    `);
  },
};
