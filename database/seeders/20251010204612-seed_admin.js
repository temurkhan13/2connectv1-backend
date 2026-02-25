'use strict';

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

/**
 * This seeder creates a default admin account.
 * Make sure you already have an "admin" role in the roles table.
 * If role title differs, adjust the query below.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Find admin role id
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE title = 'admin' LIMIT 1;`,
    );

    if (!roles || roles.length === 0) {
      throw new Error('Admin role not found. Please seed roles first.');
    }

    const roleId = roles[0].id;

    // 2. Hash password securely
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, saltRounds);

    // 3. Insert admin user
    await queryInterface.bulkInsert(
      'users',
      [
        {
          id: uuidv4(),
          role_id: roleId,
          first_name: 'Super',
          last_name: 'Admin',
          email: 'admin@2connect.ai',
          password: hashedPassword,
          is_active: true,
          is_email_verified: true,
          provider: 'password',
          onboarding_status: 'completed',
          allow_matching: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {},
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('users', { email: 'admin@2connect.ai' }, {});
  },
};
