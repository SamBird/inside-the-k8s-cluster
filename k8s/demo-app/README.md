# Demo App Manifests

These manifests deploy the talk demo app into `inside-k8s-demo`.

## Apply

```bash
kubectl --context kind-inside-k8s apply -k k8s/demo-app
```

## Versioning for rollout demos

The rollout story uses explicit image tags and matching `APP_VERSION` value.

Example for version `v2`:

```bash
kubectl --context kind-inside-k8s -n inside-k8s-demo set image deployment/demo-app demo-app=demo-app:v2
kubectl --context kind-inside-k8s -n inside-k8s-demo patch configmap demo-app-config --type merge -p '{"data":{"APP_VERSION":"v2"}}'
kubectl --context kind-inside-k8s -n inside-k8s-demo rollout status deployment/demo-app
```

## Load-balancing demo

Scale replicas and port-forward the Service (not a Pod):

```bash
kubectl --context kind-inside-k8s -n inside-k8s-demo scale deployment/demo-app --replicas=3
kubectl --context kind-inside-k8s -n inside-k8s-demo port-forward svc/demo-app 8080:80
for i in {1..12}; do curl -s localhost:8080/; echo; done
```
