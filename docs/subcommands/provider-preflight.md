# Provider setup preflight

`wstack modeldiag preflight [provider-profile]` checks configured Azure, Bedrock
and Vertex provider profiles without making a model request. It works before a
models cache is available. The JSON result distinguishes missing setup,
configured values and unverified credential chains; it contains no key values.

Bedrock checks `AWS_REGION` and explicit key or credential-pair setup. Shared AWS
profiles and role/SSO chains remain unverified. `AWS_DEFAULT_REGION` alone is not
read by the current native adapter. A custom API-key endpoint can select its own
region and is reported separately.

Vertex checks the project/location settings required for its ADC route. Gemini
Express API-key routing can omit those settings; partner models may still need
them. Google ADC and `GOOGLE_APPLICATION_CREDENTIALS` are not treated as API keys
or proof of account access. Azure checks its resource/endpoint and API key.

Use the existing `modeldiag test` command for actual model/account access. Presence
checks, credential-chain hints and live authentication are separate evidence.
