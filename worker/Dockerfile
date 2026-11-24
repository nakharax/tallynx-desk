FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY server/fundednext/ ./server/fundednext/
COPY src/utils/fundedNextMcp.ts ./src/utils/fundedNextMcp.ts
COPY worker/index.ts worker/tsconfig.json ./worker/
RUN ./node_modules/.bin/tsc -p worker/tsconfig.json && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/dist/ ./dist/
USER node
EXPOSE 8080
CMD ["node", "dist/worker/index.js"]
