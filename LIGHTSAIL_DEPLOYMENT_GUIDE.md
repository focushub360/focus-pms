# Focus PMS — AWS Lightsail 5-Minute Deployment Guide

This guide describes how to deploy **Focus PMS** to an **AWS Lightsail** instance for **\$3.50 – \$5.00 / month** (first 3 months free on AWS).

---

## 🛠 Step 1: Create a Lightsail Instance

1. Log into your [AWS Management Console](https://console.aws.amazon.com/) and navigate to **Amazon Lightsail** (or go to [https://lightsail.aws.amazon.com/](https://lightsail.aws.amazon.com/)).
2. Ensure your region is set to **Mumbai (`ap-south-1`)** for lowest latency in India.
3. Click **Create instance**.
4. Configure instance parameters:
   - **Platform**: `Linux/Unix`
   - **Blueprint**: `OS Only` → `Ubuntu 22.04 LTS` (or `Ubuntu 24.04 LTS`)
   - **Instance plan**: Choose **\$3.50 USD/month** (512 MB RAM, 1 vCPU) or **\$5.00 USD/month** (1 GB RAM, 1 vCPU). *(Recommended: \$5 plan for smoother Docker builds).*
   - **Identify your instance**: Name it `focus-pms`.
5. Click **Create instance** and wait ~1 minute for status to become **Running**.

---

## 🌐 Step 2: Attach a Static IP & Open Firewall Ports

Lightsail instances change public IP on reboot unless a Static IP is attached (free as long as it's attached).

1. In Lightsail, go to the **Networking** tab.
2. Click **Create static IP** → select `focus-pms` → click **Create**.
3. Note your new **Static IP** (e.g., `13.233.xxx.xxx`).
4. Click on your `focus-pms` instance → select the **IPv4 Firewall** tab.
5. Ensure the following rules are present:
   - **SSH**: Port `22` (TCP)
   - **HTTP**: Port `80` (TCP)
   - **HTTPS**: Port `443` (TCP)

---

## 🚀 Step 3: Run the 1-Line Deployment

1. On the `focus-pms` instance card in Lightsail, click the terminal icon (`>_`) to open the **Browser SSH Terminal**.
2. Run the following command:

```bash
git clone https://github.com/focushub360/focus-pms.git && cd focus-pms && bash scripts/deploy_lightsail.sh
```

The script will automatically:
- Install Docker and Docker Compose plugin.
- Configure your production `.env` with your MongoDB Atlas connection and credentials.
- Build and start the FastAPI backend container and Nginx React frontend container.
- Run a health check against `http://localhost/health`.

---

## 🔑 Step 4: Access Your Application

Once the script finishes, open your browser and navigate to:
```
http://<YOUR_LIGHTSAIL_STATIC_IP>
```

Log in with your Super Administrator credentials:
- **Email**: `kiran@focusengineering.in`
- **Password**: `Kiran@123`

---

## 🔒 Step 5: (Optional) Setup Custom Domain & Free SSL

If you have a domain (e.g. `pms.focusengineering.in`):

1. Go to your DNS provider (GoDaddy / Cloudflare / Route 53) and add an **A Record**:
   - Host: `pms` (or `@`)
   - Points to: `<YOUR_LIGHTSAIL_STATIC_IP>`
2. Inside your Lightsail terminal, install Certbot:
   ```bash
   sudo apt-get install -y certbot
   sudo certbot certonly --standalone -d pms.focusengineering.in
   ```
3. Update `frontend/nginx.conf` with your SSL certificate paths and reload Nginx.

---

## 🔄 Useful Commands

- **View live logs**:
  ```bash
  sudo docker compose -f docker-compose.lightsail.yml logs -f
  ```
- **Update with latest git code**:
  ```bash
  git pull && sudo docker compose -f docker-compose.lightsail.yml up -d --build
  ```
- **Restart services**:
  ```bash
  sudo docker compose -f docker-compose.lightsail.yml restart
  ```
