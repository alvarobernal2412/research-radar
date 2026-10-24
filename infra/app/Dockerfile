FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js import.js shim.js schema.sql ./
RUN mkdir -p /data/files && chown node /data/files
USER node
EXPOSE 8080
CMD ["node", "server.js"]
