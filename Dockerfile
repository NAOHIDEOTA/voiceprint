FROM rust:1.94-bookworm

RUN rustup target add wasm32-unknown-unknown \
    && curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs python3-pip \
    && npm install -g npm@latest \
    && rm -rf /var/lib/apt/lists/*

# モデル量子化 (small tier 生成) 用
RUN pip3 install --break-system-packages --no-cache-dir onnx onnxruntime

WORKDIR /workspace
