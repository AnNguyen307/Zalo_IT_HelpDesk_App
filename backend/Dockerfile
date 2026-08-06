FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY data ./data
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/server.mjs"]
