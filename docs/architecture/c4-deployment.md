# Auro Production Deployment

```mermaid
C4Deployment
  title Deployment Diagram - Production Provider-Neutral Profile

  Deployment_Node(browser, "Managed User Device", "Chrome 120+") {
    Container(extension, "Chrome Extension", "MV3", "Local and Gmail enforcement")
  }

  Deployment_Node(edge, "Static HTTPS Host", "Vercel or equivalent") {
    Container(dashboard, "Admin Dashboard", "Static React SPA", "Administration UI")
  }

  Deployment_Node(compute, "Container Compute", "Managed container platform") {
    Container(api, "API Instances", "Non-root FastAPI image", "Synchronous API and inline scans")
    Container(worker, "Worker Instances", "Non-root Python image", "Leased attachment processing")
  }

  Deployment_Node(data, "Managed Data Services", "Private network or restricted endpoints") {
    ContainerDb(postgres, "PostgreSQL", "PostgreSQL 16 compatible", "Authoritative durable state")
    ContainerDb(objects, "Object Storage", "Private S3-compatible", "Lifecycle-controlled raw inputs")
    ContainerDb(redis, "Redis", "Managed Redis", "Shared login throttling")
  }

  Rel(extension, api, "Requests scans and policy", "HTTPS")
  Rel(dashboard, api, "Requests administration data", "HTTPS")
  Rel(api, postgres, "Reads and writes", "TLS/PostgreSQL")
  Rel(api, objects, "Stages deep-scan objects", "TLS/S3 API")
  Rel(api, redis, "Checks login rate limits", "TLS/RESP")
  Rel(worker, postgres, "Claims jobs and stores masked output", "TLS/PostgreSQL")
  Rel(worker, objects, "Reads and deletes raw input", "TLS/S3 API")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

The worker needs a continuously runnable process. The dashboard can be static-hosted, but the
worker must not be reduced to a request-only serverless function. Database, object storage, and
Redis endpoints should be private or restricted to the compute environment.
