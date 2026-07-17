FROM node:20-slim

# Full ffmpeg build (includes drawtext/libfreetype, curves, and every other
# filter this app uses) — the npm "ffmpeg-static" package ships a minimal
# build that's missing several of these, which is why editing was failing.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg fontconfig && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
