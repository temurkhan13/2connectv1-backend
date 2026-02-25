'use strict';

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async queryInterface => {
    await queryInterface.bulkInsert(
      'roles',
      [
        {
          id: uuidv4(),
          title: 'admin',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: uuidv4(),
          title: 'user',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {},
    );
  },

  down: async queryInterface => {
    await queryInterface.bulkDelete(
      'roles',
      {
        title: ['admin', 'user'],
      },
      {},
    );
  },
};
