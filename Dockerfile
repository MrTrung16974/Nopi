# Image cho api / worker / web (monorepo pnpm + turbo). Chọn bằng --target.
#   docker build --target api .
#   docker build --target worker .
#   docker build --target web --build-arg API_URL=http://api:3000 .

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TZ=Asia/Ho_Chi_Minh NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@10.34.9
WORKDIR /app

# --- Cài dependencies (bỏ apps/mobile — Expo rất nặng, server không cần) ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline \
      --filter "@nopi/api..." --filter "@nopi/worker..." --filter "@nopi/web..." --filter "@nopi/db..."

# --- Build backend: packages + api + worker ---
FROM deps AS build-server
RUN pnpm turbo run build --filter=@nopi/worker... --filter=@nopi/db...

# --- Build web. Next ghi rewrites (/api → API_URL) vào bản build nên cần biết lúc build ---
FROM deps AS build-web
ARG API_URL=http://api:3000
ENV API_URL=$API_URL
RUN pnpm turbo run build --filter=@nopi/web...

# --- Runtime ---
FROM build-server AS api
ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]

FROM build-server AS worker
# ffmpeg: chuẩn hoá video/ghi âm, ảnh thu nhỏ
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]

FROM build-web AS web
ENV NODE_ENV=production
EXPOSE 3200
WORKDIR /app/apps/web
CMD ["pnpm", "start"]
