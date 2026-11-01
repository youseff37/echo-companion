FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY public ./public
COPY docs ./docs
COPY scripts ./scripts
COPY site ./site
COPY version-manifest.json runtime-sources.json ./
RUN mkdir /data && chown node:node /data
USER node
ENV ECHO_DATA_DIR=/data ECHO_BIND=0.0.0.0
EXPOSE 8787
CMD ["node","src/server.mjs"]
