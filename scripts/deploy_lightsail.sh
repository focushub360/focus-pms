#!/bin/bash
set -e

# ==============================================================================
# Focus PMS — 1-Click AWS Lightsail Deployment Script
# Targets Ubuntu 22.04 LTS / 24.04 LTS
# ==============================================================================

echo "=========================================="
echo " Starting Focus PMS Deployment on Lightsail"
echo "=========================================="

# 0. Configure 2GB Swap (Essential for 512MB RAM instances)
if [ ! -f /swapfile ]; then
    echo "[0/4] Setting up 2GB swap space for smooth build on 512MB instance..."
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "[0/4] Swap space created."
fi

# 1. Install Docker & Docker Compose if missing
if ! command -v docker &> /dev/null; then
    echo "[1/4] Installing Docker..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker $USER
    echo "[1/4] Docker installed successfully."
else
    echo "[1/4] Docker is already installed."
fi

# 2. Check for .env file
if [ ! -f .env ]; then
    echo "[2/4] Creating .env file from template..."
    cat << 'EOF' > .env
MONGO_URL=mongodb+srv://focushub360db_db_user:AmSSb44u5tKi3F52@cluster0.duezn4u.mongodb.net/focus_pms?retryWrites=true&w=majority
DB_NAME=focus_pms
MONGO_MAX_POOL_SIZE=50
MONGO_MIN_POOL_SIZE=5

JWT_SECRET=fe_focus_pms_super_secret_jwt_key_2026_prod
JWT_ALG=HS256
JWT_TTL_HOURS=12

CORS_ORIGINS=*
APP_PUBLIC_URL=http://localhost

BOOTSTRAP_ADMIN_EMAIL=kiran@focusengineering.in
BOOTSTRAP_ADMIN_PASSWORD=Kiran@123
BOOTSTRAP_ADMIN_NAME=Kiran Kulkarni

RESEND_API_KEY=
EMAIL_FROM_NAME=Focus Engineering PMS
EMAIL_FROM_ADDRESS=onboarding@resend.dev
EOF
    echo "[2/4] .env created."
else
    echo "[2/4] .env already exists."
fi

# 3. Build and launch containers
echo "[3/4] Building and launching containers via Docker Compose..."
sudo docker compose -f docker-compose.lightsail.yml down || true
sudo docker compose -f docker-compose.lightsail.yml up -d --build

# 4. Verify deployment
echo "[4/4] Verifying services..."
sleep 15
if curl -sf http://localhost/health > /dev/null; then
    echo "=========================================="
    echo " [SUCCESS] Focus PMS is live and healthy!"
    echo " Open your browser at http://$(curl -s ifconfig.me)"
    echo " Login: kiran@focusengineering.in / Kiran@123"
    echo "=========================================="
else
    echo "[WARNING] Health check pending. Checking container logs..."
    sudo docker compose -f docker-compose.lightsail.yml logs --tail 30
fi
