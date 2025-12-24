FROM node:18-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY . .

RUN chmod +x src/container/entrypoint.sh

EXPOSE 4000

CMD ["sh", "src/container/entrypoint.sh"]
