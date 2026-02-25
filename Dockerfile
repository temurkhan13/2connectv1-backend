FROM node:24

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build with increased memory
ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm run build

EXPOSE 3000

# Run migrations, seed, and start (skip rebuild since already built)
CMD npx sequelize-cli db:migrate && npx sequelize-cli db:seed:all && npm run start:prod


#CMD [ "npm", "run", "start" ]
