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

# ARG PG_VERSION='16' not used anymore

RUN apt-get update && apt-get install -y postgresql-client

CMD sleep 5 && \
    node dist/index.js