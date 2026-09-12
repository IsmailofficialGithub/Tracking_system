# Stage 1: Builder
FROM rust:1.80-slim-bookworm AS builder

WORKDIR /app

# Install necessary build dependencies (C compiler, cmake, SSL headers)
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Create a dummy main to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy the actual source code
COPY . .

# Touch main.rs to force cargo to rebuild the application
RUN touch src/main.rs
RUN cargo build --release

# Stage 2: Runtime Environment
FROM debian:bookworm-slim

WORKDIR /app

# Install CA certificates for HTTPS/Supabase communication
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder stage
COPY --from=builder /app/target/release/Backend /usr/local/bin/tracking-backend

# Expose the API port
EXPOSE 3000

# Start the application
CMD ["tracking-backend"]
