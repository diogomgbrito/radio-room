# Kubernetes Deployment

## Build & Push

```bash
# Build the image
docker build -t radio-room .

# Tag for your registry
docker tag radio-room your-registry.io/radio-room:latest
docker push your-registry.io/radio-room:latest
```

## Deploy

Apply all resources:

```bash
kubectl apply -f k8s/
```

Or apply individually:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

## Access

**Port-forward (quick test):**
```bash
kubectl port-forward svc/radio-room 3000:3000 -n radio-room
```

**Ingress (production):**
Set your domain in `k8s/ingress.yaml` and apply it.
```bash
kubectl apply -f k8s/ingress.yaml
```

## Persistence

SQLite data is stored on a persistent volume. The default PV uses `local` storage — update `k8s/pvc.yaml` to match your cluster's storage class:

```bash
# Check available storage classes
kubectl get storageclasses
```

## Customize

- **Replicas:** edit `replicas` in `k8s/deployment.yaml` (note: sticky sessions are required for WebSocket, so scale with care — see note below)
- **Image:** replace `radio-room:latest` with your registry image
- **Port:** default is 3000, change in both deployment and service if needed

> **⚠️ Scaling note:** Radio Room uses in-memory state and WebSockets. Running multiple pods requires a sticky session mechanism (session-affinity on the Service is already configured). For true multi-instance sync you'd need a shared state layer (Redis pub/sub etc.) — not currently implemented. For now, run with 1 replica.
