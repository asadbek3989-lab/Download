FROM node:20-bookworm-slim

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

ENV NODE_ENV=production
# Har ishga tushganda yt-dlp'ni yangilab oladi (YouTube tez-tez o'zgaradi)
CMD ["sh", "-c", "yt-dlp -U || true; node src/index.js"]
