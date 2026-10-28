# PriVote — Privacy-Preserving Voting Demo (Semaphore-style)

A mini-project with **React + Vite**, **Node.js + Express**, and real Semaphore V4 zero-knowledge proofs. The frontend follows the PriVote dashboard design with a member registry, group statistics, and anonymous vote-signal submission. No database is used; app state is saved in JSON files in the project root.

## Important security note

This version intentionally stores exported Semaphore identity secrets in `secrets.json` at the project root, as requested. This is appropriate only for a local educational demo. Anyone who can read this file can impersonate those identities. Do not deploy this setup or commit `secrets.json`. The file is gitignored.

The backend generates proofs because it has the secrets. The verifier receives a proof, group root, scope, message, and nullifier—not the raw secret or public key. However, because the same backend stores secrets, this is **not** a production design for protecting members from the server operator. For production, secrets should remain with users and proofs should be generated client-side or in a secure wallet.

## Requirements

- Node.js 20+ recommended
- npm

## Run

From this directory:

```bash
npm run install:all
npm run dev
```

Open the Vite URL printed by the frontend (normally `http://localhost:5173`).

The first backend start creates `data.json` and `secrets.json` if they do not exist. The default Semaphore scope is the short value `1` to satisfy the library's bytes32 string encoding constraint. `secrets.json` is private local data and must never be committed.

## Demo workflow

1. **Create member**: enter a display name. The backend creates a random Semaphore identity, stores its exported secret in `secrets.json`, and adds only its commitment to the public group registry in `data.json`.
2. **Generate proof**: choose a voter, enter a B.Tech subject as the anonymous vote signal, and generate a real Semaphore ZK proof for the configured scope.
3. **Verify proof**: the backend verifies the proof using `@semaphore-protocol/proof`, then checks the root/scope and prevents the same nullifier from being accepted twice for that scope.
4. **Inspect state**: see group members as display names and commitments; the frontend never displays private keys.

Semaphore proving artifacts may be downloaded automatically by the official library the first time a proof is generated. The first proof can take longer and needs internet access.

## Files

- `data.json`: group members, accepted nullifiers, demo scope.
- `votes.json`: successfully verified anonymous signals and minimal verification metadata.
- `secrets.json`: exported Semaphore identities. Keep private.
- `backend/src/server.js`: API, file persistence, proof generation/verification.
- `frontend/src/App.jsx`: UI.
- `frontend/vite.config.js`: enables the React plugin for Vite.

## API

- `GET /api/state` — public group state, no secrets.
- `POST /api/members` — create/register identity (`{ "name": "Alice" }`).
- `POST /api/proofs` — generate proof (`{ "memberId": "...", "message": "I am authorized" }`).
- `POST /api/verify` — verify and record the signal (`{ "proof": { ... }, "signal": "candidate-A" }`). A signal is saved only if it matches the message encoded in the proof and the proof passes verification.

This is a local educational demo, not a security-audited authorization service. The admin/member registration endpoint is intentionally open for local demonstration; real applications need authenticated and audited group administration.
