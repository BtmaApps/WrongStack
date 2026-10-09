# Promotion and recovery

## Release record

Record source revision, artifact digest/build id, configuration identity,
schema/message versions, destination and the current release being replaced.
Keep the release writer singular and do not infer authorization from a plan.

## Compatibility check

- Can old/new application versions read records written during deployment overlap?
- Can a queued message outlive the producer release and reach an older consumer?
- Does configuration change require a restart/rebuild rather than reload?
- Does the app reference assets that must remain available during client cache overlap?
- Which side effects or migrations cannot be reversed by switching artifacts?

## Promotion

Validate the candidate in the actual platform shape, observe readiness and the
real user path, then use the authorized traffic/release transition.
Define stop/rollback triggers before interpreting metrics after the fact.

## Recovery

Restore the known compatible prior artifact/config using the platform mechanism.
Verify the running release identity, user path and error/latency behavior.
Handle data repair/restore separately; do not claim app rollback recovered lost data.

Sources: [Kubernetes Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/),
[Cloudflare versions](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/).
