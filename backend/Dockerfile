# Backend Dockerfile
# Using Ubuntu to install KiCad from official PPA for cross-platform support
FROM ubuntu:24.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies, Python, and KiCad
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    git \
    software-properties-common \
    libgl1 \
    libglu1-mesa \
    libsm6 \
    libice6 \
    libxext6 \
    libxrender1 \
    && add-apt-repository -y ppa:kicad/kicad-9.0-releases \
    && apt-get update \
    && apt-get install -y --no-install-recommends kicad \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

# Copy application code
COPY . .

# Expose backend port
EXPOSE 8000

# Run the application, binding to all interfaces for LAN access
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
