# Security Policy

## Reporting a vulnerability

Please open a private security advisory on GitHub or contact the maintainers privately. Do not file public issues containing exploit details, private recordings, credentials, or sensitive transcripts.

## Scope

Security-sensitive areas include microphone capture, local model/profile storage, `.speechmodel` export/import packages, Web Crypto envelope handling, service-worker behavior, deployment headers, local trainer tooling, and adapter packaging code.

## Privacy-sensitive data

Enrollment recordings, prompt text, feature shards, frame labels, checkpoints, speaker embeddings, adapters, transcripts, portable `.speechmodel` bundles, and exported profiles are sensitive personal data. Do not attach them to public issues, crash reports, fixtures, screenshots, or CI artifacts.
