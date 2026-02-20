FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  libreoffice \
  libreoffice-writer \
  fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=8080
ENV PDF_RENDERER_BACKEND=libreoffice

EXPOSE 8080

CMD ["node", "src/index.js"]
