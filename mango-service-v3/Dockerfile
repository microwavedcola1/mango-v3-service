FROM node:16

WORKDIR /usr
COPY package.json ./
COPY yarn.lock ./
RUN yarn install
COPY . .

ENV PORT=3000

CMD [ "yarn", "dev" ]
