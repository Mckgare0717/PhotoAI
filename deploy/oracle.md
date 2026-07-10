# Deploying PhotoAI on Oracle Cloud (Always Free)

Runs the whole stack on an **Ampere A1 Flex VM (4 OCPU / 24GB RAM, arm64)**
in **UK South (London)** — permanently free under Oracle's Always Free tier,
and more powerful than the paid AWS box in `aws.md`. All images used
(node:22-slim, python:3.11-slim, pgvector/pgvector:pg16, caddy:2) publish
arm64 builds, and onnxruntime/InsightFace install fine on arm64 Python 3.11.

## 1. Sign up

https://www.oracle.com/cloud/free/ — pick **UK South (London)** as your home
region. **This cannot be changed later** and Always Free VMs can only live in
your home region. A card is required for identity verification; Always Free
resources are never billed.

> **Capacity tip (the #1 Oracle free-tier gotcha):** A1 capacity for
> free-plan accounts is often exhausted ("Out of capacity" on launch).
> Upgrading the account to **Pay As You Go** (Billing → Upgrade and Manage
> Payment Method) keeps Always Free resources free — you're only billed for
> usage *beyond* free limits, which this deployment stays within — and PAYG
> accounts get much better A1 availability. If you stay on the free plan and
> hit the error: retry at off-peak hours, try another availability domain,
> or temporarily reduce the shape to 2 OCPU / 12GB.

## 2. Create the VM

Console → **Compute → Instances → Create instance**:

- **Name**: `photoai`
- **Image**: Canonical Ubuntu 24.04 (the **aarch64** build is selected
  automatically with the shape below)
- **Shape**: Ampere → **VM.Standard.A1.Flex**, 4 OCPUs, 24GB memory
  (the full Always Free allowance)
- **Networking**: accept the default "Create new virtual cloud network"
  wizard; make sure **Assign a public IPv4 address** is on
- **SSH keys**: paste your public key (`ssh-keygen -t ed25519` on your
  machine if you don't have one)
- **Boot volume**: custom size **150GB** (Always Free includes 200GB total
  block storage; leaving headroom for backups)

Create, wait for RUNNING, note the public IP.

Optional but recommended: make the IP survive instance recreation —
Instance details → attached VNIC → IPv4 addresses → edit → change ephemeral
to **Reserved public IP** (one attached reserved IP is free).

## 3. Open ports 80/443 in the VCN

Console → **Networking → Virtual cloud networks** → your VCN → the public
subnet → its **Security List** → **Add Ingress Rules**:

| Source CIDR | Protocol | Dest. port |
|-------------|----------|------------|
| 0.0.0.0/0   | TCP      | 80         |
| 0.0.0.0/0   | TCP      | 443        |

(22 is already there from the wizard.)

## 4. Open ports 80/443 in the OS firewall — DO NOT SKIP

Oracle's Ubuntu images ship with restrictive iptables rules baked into the
OS, separate from the cloud firewall. The security list alone is **not**
enough; Caddy will be unreachable until you also do this on the VM:

```bash
ssh ubuntu@<public-ip>
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 5. Point DNS at it

Create an A record: `photos.yourdomain.com` → the public IP. Caddy needs
this resolving before first start to issue the TLS certificate.

## 6. Give the instance access to the repo (deploy key)

```bash
# on the VM
ssh-keygen -t ed25519 -C "photoai-oracle-deploy" -f ~/.ssh/photoai_deploy -N ""
cat ~/.ssh/photoai_deploy.pub
```

Add the printed public key on GitHub: **repo → Settings → Deploy keys →
Add deploy key** (leave "Allow write access" unchecked). Then:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/photoai_deploy
  IdentitiesOnly yes
EOF
```

## 7. Install Docker and the app

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker

# App
git clone git@github.com:<you>/PhotoAI.git && cd PhotoAI

# Secrets — NEVER commit this file
cat > .env <<EOF
DOMAIN=photos.yourdomain.com
ACME_EMAIL=you@yourdomain.com
ADMIN_PASSWORD=$(openssl rand -base64 18)
SESSION_SECRET=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 16)
EOF
chmod 600 .env && cat .env   # note the admin password somewhere safe

docker compose -f docker-compose.prod.yml up -d --build
```

First build takes ~10 minutes (the ML image downloads the ~300MB InsightFace
model). Then visit `https://photos.yourdomain.com/admin`.

## 8. Retention cron

```bash
crontab -e
# add (uses the ADMIN_PASSWORD from .env):
0 3 * * * . /home/ubuntu/PhotoAI/.env && curl -fsS -X POST -H "x-admin-password: $ADMIN_PASSWORD" https://$DOMAIN/api/admin/cleanup >> /tmp/photoai-cleanup.log 2>&1
```

## 9. Backups

Always Free includes 5 volume backups. Console → **Storage → Boot volumes**
→ your instance's boot volume → **Backup policies** → assign **Bronze**
(monthly incrementals). For anything beyond a pilot, also copy the photo
volume off-box periodically, e.g.:

```bash
docker run --rm -v photoai_photo-storage:/data -v ~/backups:/out alpine \
  tar czf /out/photos-$(date +%F).tgz -C /data .
```

and sync `~/backups` somewhere external (rclone to any free object storage).

## 10. Updating the app

```bash
cd ~/PhotoAI && git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## Troubleshooting

- **"Out of capacity" launching A1** — see the capacity tip in step 1.
- **Site unreachable but containers running** — 90% of the time it's the
  OS iptables rules (step 4), the other 10% the security list (step 3).
- **TLS errors on first visit** — DNS not propagated when Caddy started;
  `docker compose -f docker-compose.prod.yml restart caddy` once it resolves.
