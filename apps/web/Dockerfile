FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm install
COPY . .
WORKDIR /app/apps/web
CMD ["npm", "run", "dev"]
