FROM node:10-alpine

RUN apk add --update python g++ make git

WORKDIR /opt/app

# Install NPM dependencies before the code (save time on builds)
COPY ./package.json /opt/app/package.json
RUN npm install --production

# Install our app code
COPY ./ /opt/app/

# Config parameters that don't change that often
ENV CARD_IMAGE_RENDERING=static
ENV STATIC_CARD_FRONT_IMAGE=/opt/app/public/images/card_front_sample.jpg
ENV STATIC_CARD_BACK_IMAGE=/opt/app/public/images/card_back_sample.jpg

ENV CONNECTION_IMAGE_PROVIDER=static
ENV CONNECTION_ICON_PATH=/opt/app/public/images/ibm_connection.png

ENV LOGIN_PROOF_PROVIDER=file
ENV LOGIN_PROOF_PATH=/opt/app/docs/hr_login_proof_schema.json

ENV SIGNUP_PROOF_PROVIDER=none

ENV SCHEMA_TEMPLATE_PATH=/opt/app/docs/employment_schema.json

CMD npm start
