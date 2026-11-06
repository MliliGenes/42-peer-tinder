FROM node:22.13-alpine

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY clients/package.json clients/package.json
RUN npm ci

COPY api api
CMD ["npm", "run", "start:dev", "--workspace", "api"]
