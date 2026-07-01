FROM ubuntu:24.04

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    python3 \
    xz-utils \
    file \
    libglib2.0-0 \
    libgtk-3-0 \
    libwebkit2gtk-4.1-0 \
    libgl1 \
    libglu1-mesa \
    libdbus-1-3 \
    libx11-6 \
    libxext6 \
    libxrender1 \
    libxrandr2 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libfontconfig1 \
    libsm6 \
    libice6 \
    libmspack0 \
    libnss3 \
    libasound2t64 \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

ARG ORCA_APPIMAGE_URL=https://github.com/OrcaSlicer/OrcaSlicer/releases/download/nightly-builds/OrcaSlicer_Linux_AppImage_Ubuntu2404_nightly.AppImage
RUN mkdir -p /opt/orca-slicer \
  && curl -fsSL "$ORCA_APPIMAGE_URL" -o /opt/orca-slicer/OrcaSlicer.AppImage \
  && chmod +x /opt/orca-slicer/OrcaSlicer.AppImage \
  && cd /opt/orca-slicer \
  && ./OrcaSlicer.AppImage --appimage-extract \
  && rm -f /opt/orca-slicer/OrcaSlicer.AppImage

COPY orca-profiles /opt/orca-profiles

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "-p", "3000"]
