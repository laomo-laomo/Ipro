# IPro API - Dockerfile
FROM node:18-slim AS builder

# 安装 Python (Edge TTS 需要)
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*
RUN pip3 install edge-tts

WORKDIR /app

# 先复制依赖文件利用 Docker 缓存
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm install

# 复制源码并构建
COPY . .
RUN npm run build --workspace=apps/api

# 生产镜像
FROM node:18-slim

RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip3 install edge-tts

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Prisma engine
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

RUN mkdir -p /app/apps/api/public/temp/tts

EXPOSE 3001

WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
