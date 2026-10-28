import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { encodeBytes32String } from "ethers";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof, verifyProof } from "@semaphore-protocol/proof";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DATA_FILE = path.join(PROJECT_ROOT, "data.json");
const SECRETS_FILE = path.join(PROJECT_ROOT, "secrets.json");
const VOTES_FILE = path.join(PROJECT_ROOT, "votes.json");

const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json({ limit: "2mb" }));

const DEFAULT_SCOPE = "1";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return fallback;
  }
}

async function writeJson(file, value) {
  // Write to a temporary file first to avoid leaving a partially-written JSON file.
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}

async function ensureFiles() {
  const data = await readJson(DATA_FILE, null);
  if (!data) {
    await writeJson(DATA_FILE, {
      version: 1,
      scope: DEFAULT_SCOPE,
      members: [],
      acceptedNullifiers: []
    });
  }
  const secrets = await readJson(SECRETS_FILE, null);
  if (!secrets) await writeJson(SECRETS_FILE, { version: 1, identities: {} });
  const votes = await readJson(VOTES_FILE, null);
  if (!votes) await writeJson(VOTES_FILE, []);
}

async function loadData() {
  return readJson(DATA_FILE, { version: 1, scope: DEFAULT_SCOPE, members: [], acceptedNullifiers: [] });
}

async function loadSecrets() {
  return readJson(SECRETS_FILE, { version: 1, identities: {} });
}

function buildGroup(data) {
  // The tree is reconstructed deterministically from registered commitments.
  return new Group(data.members.map((m) => BigInt(m.commitment)));
}

function publicState(data) {
  const group = buildGroup(data);
  return {
    scope: data.scope,
    groupRoot: group.root.toString(),
    memberCount: data.members.length,
    members: data.members.map(({ id, name, commitment, createdAt }) => ({ id, name, commitment, createdAt })),
    acceptedNullifierCount: data.acceptedNullifiers.length
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, project: "Semaphore membership demo" }));

app.get("/api/state", async (_req, res, next) => {
  try {
    const data = await loadData();
    res.json(publicState(data));
  } catch (error) { next(error); }
});

app.post("/api/members", async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: "Enter a member display name." });

    const data = await loadData();
    const secrets = await loadSecrets();
    const identity = new Identity();
    const id = crypto.randomUUID();

    // Only the commitment is added to the group registry.
    data.members.push({
      id,
      name,
      commitment: identity.commitment.toString(),
      createdAt: new Date().toISOString()
    });

    // The secret is deliberately stored in project-root secrets.json per user request.
    // Never expose this value through the API.
    secrets.identities[id] = {
      privateKey: identity.export(),
      createdAt: new Date().toISOString()
    };

    await writeJson(SECRETS_FILE, secrets);
    await writeJson(DATA_FILE, data);
    res.status(201).json({ member: data.members.at(-1), state: publicState(data) });
  } catch (error) { next(error); }
});

app.post("/api/proofs", async (req, res, next) => {
  try {
    const memberId = String(req.body?.memberId ?? "");
    const message = String(req.body?.message ?? "I am an authorized member").trim().slice(0, 200);
    if (!memberId) return res.status(400).json({ error: "Choose a member." });
    if (!message) return res.status(400).json({ error: "Signal/message cannot be empty." });
    if (Buffer.byteLength(message, "utf8") > 31) {
      return res.status(400).json({ error: "The anonymous signal must be at most 31 UTF-8 bytes for Semaphore string encoding." });
    }

    const data = await loadData();
    const secrets = await loadSecrets();
    const member = data.members.find((m) => m.id === memberId);
    const savedIdentity = secrets.identities[memberId];
    if (!member || !savedIdentity) return res.status(404).json({ error: "Member identity was not found." });

    const identity = Identity.import(savedIdentity.privateKey);
    const group = buildGroup(data);
    const scope = data.scope;

    // Semaphore requires a meaningful anonymity set; the UI warns users that this
    // tiny local demo is not anonymous in practice.
    const proof = await generateProof(identity, group, message, scope);

    // This is proof-only output: never include the identity secret or public key.
    res.json({
      proof,
      preview: {
        groupRoot: proof.merkleTreeRoot,
        scope: proof.scope,
        message: proof.message,
        nullifier: proof.nullifier,
        merkleTreeDepth: proof.merkleTreeDepth
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/verify", async (req, res, next) => {
  try {
    const proof = req.body?.proof;
    const signal = String(req.body?.signal ?? "").trim();

    if (!proof || typeof proof !== "object") {
      return res.status(400).json({ error: "Submit a proof object." });
    }
    if (!signal) {
      return res.status(400).json({ error: "Submit the anonymous signal used to generate this proof." });
    }
    if (Buffer.byteLength(signal, "utf8") > 31) {
      return res.status(400).json({ valid: false, error: "The anonymous signal must be at most 31 UTF-8 bytes." });
    }

    // Bind the human-readable signal to the signal encoded inside the proof.
    // Otherwise a client could submit a proof for one signal but save another vote.
    let encodedSignal;
    try {
      // Match Semaphore's conversion: numeric strings are interpreted as numbers.
      encodedSignal = BigInt(signal).toString();
    } catch {
      encodedSignal = BigInt(encodeBytes32String(signal)).toString();
    }
    if (encodedSignal !== String(proof.message)) {
      return res.status(400).json({ valid: false, error: "The submitted signal does not match the signal proved. Generate a new proof for this signal." });
    }

    const data = await loadData();
    const currentState = publicState(data);

    // Ensure the proof is tied to the current group state and this app's scope.
    if (String(proof.merkleTreeRoot) !== currentState.groupRoot) {
      return res.status(400).json({ valid: false, error: "Proof uses a stale or different group root." });
    }
    if (String(proof.scope) !== String(data.scope)) {
      return res.status(400).json({ valid: false, error: "Proof uses an unexpected scope." });
    }

    const cryptographicallyValid = await verifyProof(proof);
    if (!cryptographicallyValid) {
      return res.status(400).json({ valid: false, error: "Cryptographic proof verification failed." });
    }

    const nullifierKey = `${proof.scope}:${proof.nullifier}`;
    if (data.acceptedNullifiers.includes(nullifierKey)) {
      return res.status(409).json({ valid: false, replayed: true, error: "This identity has already been accepted for this scope." });
    }

    const votes = await readJson(VOTES_FILE, []);
    if (!Array.isArray(votes)) {
      throw new Error("votes.json must contain a JSON array.");
    }

    // Store the submitted vote signal without a member name or identity commitment.
    // The nullifier is retained to support audit/replay checks for this scope.
    votes.push({
      signal,
      scope: String(proof.scope),
      nullifier: String(proof.nullifier),
      groupRoot: String(proof.merkleTreeRoot),
      submittedAt: new Date().toISOString()
    });

    data.acceptedNullifiers.push(nullifierKey);
    await Promise.all([
      writeJson(VOTES_FILE, votes),
      writeJson(DATA_FILE, data)
    ]);

    res.json({
      valid: true,
      message: "Proof verified and anonymous signal saved to votes.json.",
      savedSignal: signal,
      nullifier: String(proof.nullifier),
      scope: String(proof.scope),
      groupRoot: String(proof.merkleTreeRoot),
      acceptedNullifierCount: data.acceptedNullifiers.length
    });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "The request failed.",
    details: process.env.NODE_ENV === "development" ? String(error?.message ?? error) : undefined
  });
});

const PORT = Number(process.env.PORT || 8000);
await ensureFiles();
app.listen(PORT, () => {
  console.log(`Semaphore demo API running at http://localhost:${PORT}`);
  console.log(`Local data: ${DATA_FILE}`);
  console.log(`Identity secrets: ${SECRETS_FILE} (KEEP PRIVATE; gitignored)`);
});
