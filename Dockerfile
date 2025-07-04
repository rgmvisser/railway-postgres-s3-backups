FROM alpine:3.21 AS build

RUN apk add --update --no-cache nodejs npm

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

WORKDIR /root

COPY package*.json tsconfig.json ./
COPY src ./src

RUN npm install && \
    npm run build && \
    npm prune --production

FROM alpine:3.21

WORKDIR /root

COPY --from=build /root/node_modules ./node_modules
COPY --from=build /root/dist ./dist

ARG PG_VERSION='15'

# aws-cli and pv are used for restoring from S3
RUN apk add --update --no-cache postgresql${PG_VERSION}-client --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main && \
    apk add --update --no-cache nodejs npm aws-cli pv
RUN echo "https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories
RUN apk update
RUN apk add zstd=1.5.7-r1

CMD pg_isready --dbname=$BACKUP_DATABASE_URL && \
    pg_dump --version && \
    node dist/index.js
