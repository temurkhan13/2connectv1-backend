FROM node:24

WORKDIR /app

COPY . /app/

RUN npm install

EXPOSE 3000

CMD npm run migrate && npm run seed && npm run start


#CMD [ "npm", "run", "start" ]
