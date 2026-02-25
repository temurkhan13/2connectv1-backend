'use strict';
const ProviderEnum = {
  PASSWORD: 'password',
  GOOOGLE: 'google',
};
const GenderEnum = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other',
};
const OnboardingStatusEnum = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'roles',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      provider: {
        type: Sequelize.ENUM(...Object.values(ProviderEnum)),
        allowNull: false,
        defaultValue: 'password',
      },
      first_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      last_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      password: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      avatar: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      linkedin_profile: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      objective: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      gender: {
        type: Sequelize.ENUM(...Object.values(GenderEnum)),
        allowNull: true,
      },
      date_of_birth: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      is_email_verified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      email_notifications: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      timezone: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      onboarding_status: {
        type: Sequelize.ENUM(...Object.values(OnboardingStatusEnum)),
        defaultValue: OnboardingStatusEnum.NOT_STARTED,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      allow_matching: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      last_login_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex('users', ['onboarding_status'], {
      name: 'users_onboarding_status_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('users', ['is_active'], {
      name: 'users_is_active_idx',
      using: 'BTREE',
    });

    await queryInterface.addIndex('users', ['objective'], {
      name: 'users_objective_idx',
      using: 'BTREE',
    });
  },

  down: async queryInterface => {
    await queryInterface.removeIndex('users', 'users_objective_idx');
    await queryInterface.removeIndex('users', 'users_is_active_idx');
    await queryInterface.removeIndex('users', 'users_onboarding_status_idx');
    await queryInterface.dropTable('users');
  },
};
