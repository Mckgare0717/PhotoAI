# Deploying PhotoAI on AWS (EC2 + Docker Compose)

Single EC2 instance in **eu-west-2 (London)** running the whole stack via
`docker-compose.prod.yml`, with Caddy terminating HTTPS. This keeps all data
in the UK and matches the app's architecture (persistent process, local
volume storage). Total cost ≈ $60–75/month on-demand; ~40% less with a
1-year savings plan.

## 1. Launch the instance

- **Region**: eu-west-2 (London)
- **AMI**: Ubuntu Server 24.04 LTS (arm64 works and is cheaper — see note below)
- **Type**: `t3a.large` (2 vCPU, 8GB) — or `t4g.large` (arm64, ~15% cheaper).
  8GB gives InsightFace headroom while indexing; `t3a.medium` (4GB) survives
  light use but swaps under a big upload burst.
- **Storage**: 100GB gp3 root volume (photos live here; grow it later with
  `aws ec2 modify-volume`, no downtime)
- **Security group**:
  - 22/tcp from your IP only
  - 80/tcp and 443/tcp from 0.0.0.0/0
  - nothing else — Postgres and the ML service are never exposed
- Allocate an **Elastic IP** and associate it with the instance.

> arm64 note: all images used (node:22-slim, python:3.11-slim,
> pgvector/pgvector:pg16, caddy:2) publish arm64 builds, and
> onnxruntime/insightface install fine on arm64 Python 3.11.

## 2. Point DNS at it

Create an A record (Route 53 or your registrar): `photos.yourdomain.com` →
the Elastic IP. Caddy needs this resolving before first start to issue the
TLS certificate.

## 3. Give the instance access to the repo (deploy key)

The repo is private, so the instance needs credentials to clone it. Use a
read-only deploy key — it grants access to this one repo and nothing else:

```bash
# on the EC2 instance
ssh-keygen -t ed25519 -C "photoai-ec2-deploy" -f ~/.ssh/photoai_deploy -N ""
cat ~/.ssh/photoai_deploy.pub
```

Add the printed public key on GitHub: **repo → Settings → Deploy keys →
Add deploy key** (leave "Allow write access" unchecked). Then point SSH at it:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/photoai_deploy
  IdentitiesOnly yes
EOF
```

## 4. Install Docker and the app

SSH in, then:

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

## 5. Retention cron

```bash
crontab -e
# add (uses the ADMIN_PASSWORD from .env):
0 3 * * * . /home/ubuntu/PhotoAI/.env && curl -fsS -X POST -H "x-admin-password: $ADMIN_PASSWORD" https://$DOMAIN/api/admin/cleanup >> /var/log/photoai-cleanup.log 2>&1
```

## 6. Backups

Photos and the database live in Docker volumes on the root EBS volume, so
EBS snapshots cover everything. Set a daily policy with Data Lifecycle
Manager (console: EC2 → Lifecycle Manager, or):

```bash
aws dlm create-lifecycle-policy \
  --description "PhotoAI daily snapshots" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::<account>:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{"ResourceTypes":["VOLUME"],"TargetTags":[{"Key":"app","Value":"photoai"}],"Schedules":[{"Name":"daily","CreateRule":{"Interval":24,"IntervalUnit":"HOURS","Times":["02:00"]},"RetainRule":{"Count":14}}]}'
```

(tag the instance's volume with `app=photoai` for this to match).

## 7. Updating the app

```bash
cd ~/PhotoAI && git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## When to outgrow this setup

Move pieces off the box only when a limit actually bites:

- **Disk pressure / many concurrent events** → swap `web/src/lib/storage.ts`
  for S3 (five functions), keep everything else.
- **Need zero-downtime deploys or >1 web node** → RDS Postgres (pgvector is
  supported), S3 storage, and a real job queue — then ECS makes sense.
- **Indexing too slow for multi-thousand-photo events** → run a second
  ml-service container and round-robin, or move it to a compute-optimized
  instance.
