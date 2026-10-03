# Native cloud routing by provider profile

Saved provider aliases can carry a non-secret `cloud` object. Explicit values
override the existing environment fallbacks, without mutating `process.env`.
Different provider instances can use different routing settings in one process.

| Native provider type | Profile fields | Environment fallback |
| --- | --- | --- |
| `amazon-bedrock` | `region` | `AWS_REGION` |
| `google-vertex` | `project`, `location` | `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` |
| `azure` | `resourceName` | `AZURE_RESOURCE_NAME` |
| `azure-cognitive-services` | `resourceName` | `AZURE_COGNITIVE_SERVICES_RESOURCE_NAME` |

For an existing saved alias:

```powershell
wstack auth cloud work-vertex --project team-project --location europe-west4
wstack auth cloud work-bedrock --region eu-west-1
wstack auth cloud work-azure --resource-name team-resource
wstack auth cloud work-vertex
wstack auth cloud work-vertex clear
```

In TUI/REPL use `/auth cloud work-vertex project team-project`,
`/auth cloud work-vertex location europe-west4`, or `/auth cloud <alias> clear`.
WebUI saved provider profiles and SimpleUI's credential panel expose the same
validated fields. Empty fields clear an override and use the environment again.
Re-select the provider or restart to construct an instance with the new settings.

Credentials stay in their existing API-key/vault or SDK authentication chain.
This feature does not add AWS role/SSO configuration, transfer credential files
into containers, or prove account/model permissions. Preflight uses the same
resolved routing fields and labels unresolved credential chains unverified.
Automation copies the selected saved profile's cloud settings alongside that
profile's credential reference; it does not copy other host profiles.
