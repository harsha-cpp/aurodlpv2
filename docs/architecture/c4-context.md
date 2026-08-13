# Auro System Context

```mermaid
C4Context
  title System Context - Auro Healthcare DLP

  Person(staff, "Hospital Staff", "Uses Gmail and browser tools")
  Person(admin, "Compliance Administrator", "Manages policy and reviews events")
  System(auro, "Auro Healthcare DLP", "Prevents supported patient-data disclosure in Chrome")
  System_Ext(gmail, "Gmail", "External email composition and delivery")
  System_Ext(webApps, "Browser Web and AI Applications", "External HTTP(S) text-entry destinations")

  Rel(staff, auro, "Receives local and managed protection through", "Chrome Extension")
  Rel(admin, auro, "Configures tenants and reviews quarantine", "HTTPS")
  Rel(auro, gmail, "Intercepts drafts before native send", "Browser DOM")
  Rel(auro, webApps, "Guards supported text insertion and submission", "Browser DOM")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

The Auro boundary includes the extension, dashboard, API, worker, and controlled data stores.
Gmail and other websites remain external systems whose internals Auro does not control.
