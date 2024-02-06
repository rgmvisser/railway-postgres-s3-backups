FROM node:18-bullseye-slim as build

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

WORKDIR /root

COPY package*.json tsconfig.json ./
COPY src ./src

RUN npm install && \
    npm run build && \
    npm prune --production

FROM build as app

WORKDIR /root

COPY --from=build /root/node_modules ./node_modules
COPY --from=build /root/dist ./dist

ARG PG_VERSION='15'

RUN apt-get update && apt-get install -y wget gnupg2 lsb-release
RUN echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
RUN apt-get update && apt-get install -y postgresql-client-${PG_VERSION}

CMD sleep 3 && \
    node dist/index.js