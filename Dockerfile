FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp (mustaqil binary) + deno (YouTube uchun JS runtime kerak)
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
      -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    DATA_DIR=/data
RUN mkdir -p /data
# Baza va cookies shu yerda saqlanadi. Railway'da /data ga VOLUME ulang.
VOLUME ["/data"]

CMD ["sh", "-c", "yt-dlp -U || true; node src/index.js"]
