# Tech Stack Validator (Compact)

Validates package/library/framework choices before they are committed.

## Rules

1. Detect the ecosystem first (package.json → JS, pyproject.toml → Python, Cargo.toml → Rust, etc.).
2. Verify existence — consult the ecosystem's registry endpoint.
3. Check the latest version from the registry (never trust training data versions).
4. Reject dead packages — no release in >2 years + unresolved critical issues.
5. Reject prehistoric technology — superseded ≥5 years ago.
6. Prefer built-in over third-party — many modern runtimes obsolete packages.
7. Single-shot budget: detect → search registry → verify → report.

## Ecosystem registry map

| Language | Registry | Package Manager |
|----------|----------|-----------------|
| JavaScript/TS | registry.npmjs.org | pnpm/npm/yarn |
| Python | pypi.org | pip/poetry |
| Rust | crates.io | cargo |
| Go | proxy.golang.org | go |
| Ruby | rubygems.org | bundler |
| .NET | api.nuget.org | dotnet |
| PHP | repo.packagist.org | composer |