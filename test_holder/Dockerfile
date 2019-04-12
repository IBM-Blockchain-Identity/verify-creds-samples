FROM node:10-alpine

RUN apk add --update python g++ make

WORKDIR /opt/app

# Install NPM dependencies before the code (save time on builds)
COPY ./package.json /opt/app/package.json
RUN npm install --production

# Install our app code
COPY ./ /opt/app/

CMD npm start
