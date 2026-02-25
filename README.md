Instructions to set up and run this Nest application

A. Required dependencies

1. Node.js v22+ (with npm)

2. Nest CLI (optional but recommended): npm i -g @nestjs/cli

3. PostgreSQL v15+

B. Setup Environment

1. Create a .env file in the project root directory. Use .example.env file for reference

C. Install Dependencies > Run Database setup

1. npm install

2. npm run migrate

3. npm run seed

D. Run the server

# development

npm run start

# watch mode

npm run start:dev

# production mode

npm run start:prod
