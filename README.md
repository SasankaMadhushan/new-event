# New Event Platform — CMM707 Cloud Computing Coursework

A cloud-native microservices solution for the New Event platform, built on Kubernetes (k3s), with a relational database, a serverless notification trigger, a real-time analytics pipeline, and automated CI/CD using blue-green deployment.

## Architecture Overview

- **Frontend** — static site (nginx), served via Traefik Ingress
- **Event Service, Program Service, Registration Service** — Node.js/Express REST APIs, backed by Amazon RDS PostgreSQL
- **Analytics Service** — ingests frontend tracking events into ClickHouse
- **Metabase** — dashboards over ClickHouse (NodePort :30010)
- **AWS Lambda + S3** — low-seat notification trigger
- **Prometheus + Grafana + Alertmanager** — observability (Grafana via Ingress at `/grafana`)
- **GitHub Actions** — 5 independent CI/CD pipelines with blue-green deployment

All application services, plus Grafana, are reachable through a single Traefik Ingress on port 80:

| Path | Routes to |
|---|---|
| `/` | Frontend |
| `/events` | Event Service |
| `/programs` | Program Service |
| `/registrations` | Registration Service |
| `/analytics` | Analytics Service |
| `/grafana` | Grafana |

Metabase remains on NodePort `:30010` (documented exception — limited subpath routing support).

## Runbook

### 1. Deployment

1. Provision an EC2 instance (Amazon Linux 2023, t3.large recommended) with an Elastic IP, and a security group allowing SSH (22), HTTP (80), and NodePort 30010 (Metabase).
2. Install Docker:
   ```bash
   sudo dnf install -y docker
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user
   ```
3. Install k3s:
   ```bash
   curl -sfL https://get.k3s.io | sh -
   mkdir -p ~/.kube
   sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
   sudo chown $(id -u):$(id -g) ~/.kube/config
   ```
4. Create the namespace:
   ```bash
   kubectl create namespace new-event
   kubectl config set-context --current --namespace=new-event
   ```
5. Provision an RDS PostgreSQL instance in the same VPC, with its security group restricted to the EC2 instance's security group only. Create the schema:
   ```sql
   CREATE TABLE events (event_id SERIAL PRIMARY KEY, title TEXT, venue TEXT, event_time TIMESTAMP, ticket_price NUMERIC, capacity INT, seats_available INT);
   CREATE TABLE programs (program_id SERIAL PRIMARY KEY, day TEXT, track TEXT, session TEXT, speaker_name TEXT, session_time TIMESTAMP);
   CREATE TABLE registrations (registration_id SERIAL PRIMARY KEY, event_id INT REFERENCES events(event_id), name TEXT, email TEXT, ticket_count INT, created_at TIMESTAMP DEFAULT now());
   ```
6. Create the Kubernetes Secret for database credentials:
   ```bash
   kubectl create secret generic db-credentials \
     --from-literal=DB_HOST=<rds-endpoint> \
     --from-literal=DB_USER=postgres \
     --from-literal=DB_PASSWORD='<password>' \
     --from-literal=DB_NAME=neweventdb
   ```
7. Create the S3 bucket and Lambda function for low-seat notifications, with an IAM role scoped to `s3:PutObject` on that bucket only.
8. For each of the five services, build the Docker image, import into k3s's containerd, then apply the blue/green Deployment and Service manifests (`kubectl apply -f <service>-bluegreen.yaml`).
9. Deploy ClickHouse and Metabase with PersistentVolumeClaims:
   ```bash
   kubectl apply -f clickhouse-deployment.yaml
   kubectl apply -f metabase-deployment.yaml
   ```
   Create a dedicated ClickHouse user with `SELECT`/`INSERT` grants for Metabase and the Analytics Service.
10. Install the observability stack:
    ```bash
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm install monitoring prometheus-community/kube-prometheus-stack -f monitoring-values.yaml
    ```
11. Apply the Ingress:
    ```bash
    kubectl apply -f frontend-ingress.yaml
    ```
12. In the GitHub repository settings, add secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `EC2_HOST`, `EC2_SSH_KEY`. Push to `main` to trigger the pipelines under `.github/workflows/`.

### 2. Testing

1. Visit `http://<elastic-ip>/` — confirm the frontend loads.
2. `curl http://<elastic-ip>/events` — confirm event data returns as JSON.
3. `curl -X POST http://<elastic-ip>/registrations -H "Content-Type: application/json" -d '{"event_id":1,"name":"Test","email":"t@example.com","ticket_count":1}'` — confirm a `201` response.
4. Register for an event with fewer than 10 seats available, then check `aws s3 ls s3://<bucket>/low-seats/` for a new notification file.
5. Interact with the frontend (video section, register form, program tabs), then query ClickHouse:
   ```bash
   curl -X POST 'http://localhost:8123' -u <user>:<password> -d "SELECT event_type, count(*) FROM web_events GROUP BY event_type"
   ```
   and confirm the Metabase dashboard (`:30010`) reflects the new data.
6. Visit `http://<elastic-ip>/grafana` and confirm live pod metrics for the `new-event` namespace.
7. Push a change to any service folder and confirm in the GitHub Actions tab that the pipeline builds, deploys to the idle blue/green slot, and switches traffic with zero failed requests.

## Repository Structure

```
.
├── frontend/                  # Static site + Dockerfile + K8s manifests
├── event-service/              # Node.js/Express + Dockerfile + K8s manifests
├── program-service/
├── registration-service/
├── analytics-service/
└── .github/workflows/          # 5 independent CI/CD pipelines (one per service)
```

## CI/CD

Each service has its own GitHub Actions workflow, triggered only on changes within that service's folder. Each pipeline: builds a Docker image tagged with the Git commit SHA, pushes it to Docker Hub, then connects to the EC2 instance over SSH to deploy the new image to the currently idle blue/green slot, waits for a successful health check, and only then switches live traffic to it — ensuring zero downtime and instant rollback (by reverting the Service selector) if needed.
