# Durable Attachment Scan Flow

```mermaid
C4Dynamic
  title Dynamic Diagram - Durable Attachment Scan and Cleanup

  Container(extension, "Chrome Extension", "MV3", "Uploads a Gmail attachment")
  Container(api, "API Application", "FastAPI", "Authenticates and stages work")
  Container(worker, "Attachment Worker", "Python", "Runs detection and cleanup")
  ContainerDb(postgres, "System Database", "PostgreSQL", "Scan and leased job state")
  ContainerDb(objects, "Private Object Store", "S3-compatible", "Transient raw bytes")

  Rel(extension, api, "1. Upload attachment with tenant credential", "Multipart/HTTPS")
  Rel(api, objects, "2. Write tenant-prefixed private object", "S3 API")
  Rel(api, postgres, "3. Commit scan and pending job atomically", "SQL")
  Rel(worker, postgres, "4. Claim job with lease and fencing", "SQL SKIP LOCKED")
  Rel(worker, objects, "5. Download raw object", "S3 API")
  Rel(worker, postgres, "6. Store masked scan result and enter cleanup", "SQL")
  Rel(worker, objects, "7. Delete raw object", "S3 API")
  Rel(worker, postgres, "8. Publish terminal result", "SQL")
  Rel(extension, api, "9. Poll terminal result then finalize draft", "JSON/HTTPS")
```

If step 3 fails, the API deletes the staged object. If steps 4–8 fail, the PostgreSQL lease and
retry state preserve the work. Terminal status is withheld until step 7 succeeds.
