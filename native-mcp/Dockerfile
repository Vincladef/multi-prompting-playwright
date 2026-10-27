FROM node:22-bookworm-slim
WORKDIR /app
COPY native-mcp/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY native-mcp/server.mjs native-mcp/widget.html ./
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node","server.mjs"]
