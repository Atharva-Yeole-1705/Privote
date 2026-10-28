# PriVote — Privacy-Preserving Voting

## About

PriVote is a mini-project demonstrating **zero-knowledge proofs (ZKPs)** and privacy-preserving group membership verification using the Semaphore protocol. A registered student can generate a cryptographic proof that they belong to an authorized group and submit a vote signal without placing their name or identity commitment in the vote record.

The application uses React for the frontend, Node.js and Express for the backend, and Semaphore's JavaScript libraries for identity commitments, group membership, and proof generation/verification. It uses local JSON files instead of a database.

## Problem Statement

Build a privacy-preserving student voting system in which only authorized group members can submit a vote, while the verification process does not require the vote record to contain the student's name or public identity key.

For this demo, registered students vote for their favourite B.Tech subject. PriVote uses Semaphore-style zero-knowledge proofs to validate group membership, binds the submitted subject signal to the proof, and rejects a proof/nullifier that has already been accepted for the same scope. After successful verification, the anonymous signal is recorded in `votes.json` without the student's display name or identity commitment.

## Steps

1. **Start with an empty local group.** On the first backend start, the application creates `data.json`, `secrets.json`, and `votes.json` in the project root if they do not already exist.
2. **Add students.** In the Group Registry panel, enter a student's display name and click **Add member**. The backend creates a Semaphore identity, stores its exported secret in `secrets.json`, and adds the identity commitment to the group's member registry in `data.json`.
3. **Build the membership group.** The backend constructs a Merkle tree from the registered commitments. The resulting group root is shown in the dashboard.
4. **Choose a voter for the local demo.** In the Voter dropdown, select a registered member. This selector exists to make local demonstrations easy; it is not an anonymous login mechanism.
5. **Enter the vote signal.** Type a B.Tech subject in the signal box. The Semaphore version used by this project encodes string signals as `bytes32`, so the signal must fit within 31 UTF-8 bytes. For example, `Operating Systems` fits.
6. **Generate a ZK proof.** Click **Generate ZK proof**. The backend uses the selected member's saved Semaphore identity, the group, the signal, and the configured scope to generate a proof.
7. **Verify and record the vote.** Click **Verify and record vote**. The backend checks that the signal matches the one encoded in the proof, validates the group root and scope, verifies the proof cryptographically, and rejects a previously accepted nullifier.
8. **Inspect local records.** After successful verification, the signal and minimal metadata are appended to `votes.json`. The accepted nullifier is also recorded in `data.json` to help prevent reuse for the same scope.

## How to run

### Requirements

- Node.js 20 or newer recommended
- npm
- Internet access the first time a proof is generated, because Semaphore proving artifacts may need to be downloaded

### Install dependencies

Extract the project ZIP, open a terminal in the project root (the directory containing the root `package.json`), and run:

```bash
npm run install:all
```

### Start the app

```bash
npm run dev
```

Open the frontend URL shown in the terminal, normally:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Health check: `http://localhost:8000/api/health`

Stop the servers with `Ctrl + C`.

### Local files

- `data.json` — member display names and commitments, group scope, and accepted nullifiers.
- `secrets.json` — exported Semaphore identity secrets. **Keep this file private and never commit it to Git.**
- `votes.json` — successfully verified vote signals and metadata (scope, nullifier, group root, and submission timestamp). Vote records do not include the student's display name or identity commitment, but the nullifier is pseudonymous metadata and should still be treated carefully.

These JSON files are created on first startup and are intentionally excluded from the project ZIP. Back them up before replacing or resetting the local project if you need to preserve members, secrets, or recorded votes.

## Concepts used

- **Zero-knowledge proofs (ZKPs):** demonstrate that a statement is true without revealing the secret witness used to prove it.
- **Semaphore identity and identity commitment:** represent a member using a cryptographic identity; the group registry stores the commitment, not the raw identity secret.
- **Merkle tree and group root:** organize member commitments and provide a compact commitment to the current group state.
- **Membership proof:** prove that an identity belongs to the registered group.
- **Signal binding:** associate the vote signal with the proof so that the backend cannot accept a proof for one signal while recording a different signal.
- **Scope:** context in which the proof and nullifier are interpreted. This demo uses the local scope value `1`; a real application should configure a unique scope for each election.
- **Nullifier and replay prevention:** detect repeat submissions from the same identity within the same scope.
- **Local JSON persistence:** store application state without a database.
- **React + Vite and Node.js + Express:** frontend and backend technologies.

## Demo Link
https://youtu.be/AhvsYms81aY

