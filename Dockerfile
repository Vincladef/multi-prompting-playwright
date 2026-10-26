FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src/ ./src/
USER pwuser
EXPOSE 3000
CMD ["node", "src/server.mjs"]
