import React, { useEffect, useState } from "react";
import {
  ShieldCheck,
  Users,
  FileCheck2,
  LockKeyhole,
  CircleCheck,
  CircleX,
  ArrowRight,
  Copy,
  Check
} from "lucide-react";

const API = "http://localhost:8000/api";

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function short(value, start = 12, end = 8) {
  if (value === undefined || value === null || value === "") return "—";
  const valueString = String(value);
  return valueString.length > start + end + 3
    ? `${valueString.slice(0, start)}…${valueString.slice(-end)}`
    : valueString;
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value).length;
}

export default function App() {
  const [state, setState] = useState(null);
  const [name, setName] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [signal, setSignal] = useState("Operating Systems");
  const [proofResult, setProofResult] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const nextState = await api("/state");
    setState(nextState);
    setSelectedMember((current) =>
      current && nextState.members.some((member) => member.id === current)
        ? current
        : (nextState.members[0]?.id ?? "")
    );
  }

  useEffect(() => {
    refresh().catch((requestError) => setError(requestError.message));
  }, []);

  async function createMember(event) {
    event.preventDefault();
    setBusy("member");
    setError("");
    setProofResult(null);
    setVerifyResult(null);
    try {
      const result = await api("/members", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() })
      });
      setName("");
      setSelectedMember(result.member.id);
      setState(result.state);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function generateProof() {
    setBusy("proof");
    setError("");
    setProofResult(null);
    setVerifyResult(null);
    try {
      const result = await api("/proofs", {
        method: "POST",
        body: JSON.stringify({ memberId: selectedMember, message: signal.trim() })
      });
      setProofResult({ ...result, signal: signal.trim() });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function verifyProof() {
    if (!proofResult?.proof) return;
    setBusy("verify");
    setError("");
    try {
      const result = await api("/verify", {
        method: "POST",
        body: JSON.stringify({ proof: proofResult.proof, signal: proofResult.signal })
      });
      setVerifyResult(result);
      await refresh();
    } catch (requestError) {
      setVerifyResult({ valid: false, error: requestError.message });
    } finally {
      setBusy("");
    }
  }

  async function copyProof() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(proofResult?.proof, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Could not copy the proof. Check clipboard permissions in your browser.");
    }
  }

  const signalBytes = utf8Bytes(signal);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PriVote home">
          <span className="brand-mark"><ShieldCheck size={22} strokeWidth={2.1} /></span>
          <span>PriVote</span>
        </a>
      </header>

      <main className="main" id="top">
        <section className="stats-grid" aria-label="Group statistics">
          <Stat icon={<Users size={20} />} label="GROUP MEMBERS" value={state?.memberCount ?? "—"} />
          <Stat icon={<ShieldCheck size={20} />} label="GROUP ROOT" value={short(state?.groupRoot, 10, 6)} mono />
          <Stat icon={<FileCheck2 size={20} />} label="ACCEPTED PROOFS" value={state?.acceptedNullifierCount ?? "—"} />
        </section>

        {error && (
          <div className="alert error-alert" role="alert">
            <CircleX size={18} />
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        <div className="workspace">
          <section className="panel registry-panel">
            <div className="panel-heading">
              <div className="step-icon">01</div>
              <div>
                <h2>Group registry</h2>
                <p>Register a member in the local group.</p>
              </div>
            </div>

            <form className="member-form" onSubmit={createMember}>
              <label htmlFor="member-name">MEMBER DISPLAY NAME</label>
              <div className="input-row">
                <input
                  id="member-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Alice"
                  maxLength={60}
                  autoComplete="off"
                />
                <button className="primary-button add-button" type="submit" disabled={busy === "member" || !name.trim()}>
                  {busy === "member" ? <span className="spinner" aria-label="Adding member" /> : "Add member"}
                </button>
              </div>
            </form>

            <div className="section-label">
              <span>REGISTERED COMMITMENTS</span>
              <span className="count-badge">{state?.members.length ?? 0}</span>
            </div>

            <div className="member-list">
              {!state?.members.length && (
                <div className="empty-state">
                  <Users size={25} />
                  <span>No members yet</span>
                  <small>Add a member to build the group.</small>
                </div>
              )}
              {state?.members.map((member, index) => (
                <div className="member-row" key={member.id}>
                  <div className="avatar">{member.name.slice(0, 1).toUpperCase()}</div>
                  <div className="member-details">
                    <strong>{member.name}</strong>
                    <code>{short(member.commitment, 14, 7)}</code>
                  </div>
                  <span className="member-index">#{String(index + 1).padStart(2, "0")}</span>
                </div>
              ))}
            </div>

            <div className="privacy-note">
              <ShieldCheck size={17} />
              <p><strong>Public registry</strong><br />Only identity commitments are listed here. Private keys are never returned by the API.</p>
            </div>
          </section>

          <section className="panel vote-panel">
            <div className="panel-heading">
              <div className="step-icon">02</div>
              <div>
                <h2>Generate a proof</h2>
                <p>Create a cryptographic membership proof.</p>
              </div>
            </div>

            <div className="form-stack">
              <div className="field">
                <label htmlFor="member-select">VOTER</label>
                <select
                  id="member-select"
                  value={selectedMember}
                  onChange={(event) => {
                    setSelectedMember(event.target.value);
                    setProofResult(null);
                    setVerifyResult(null);
                  }}
                  disabled={!state?.members.length}
                >
                  {!state?.members.length && <option value="">Add a member first</option>}
                  {state?.members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="signal">ENTER YOUR FAVOURITE B.TECH SUBJECT</label>
                <textarea
                  id="signal"
                  value={signal}
                  onChange={(event) => {
                    setSignal(event.target.value);
                    setProofResult(null);
                    setVerifyResult(null);
                  }}
                  maxLength={31}
                  rows={3}
                  placeholder="e.g. Operating Systems"
                  aria-describedby="signal-help"
                />
                <span className={`field-note ${signalBytes > 31 ? "field-note-error" : ""}`} id="signal-help">
                  {signalBytes}/31 UTF-8 bytes · This signal is recorded as the anonymous vote.
                </span>
              </div>

              <button
                className="primary-button full-button"
                type="button"
                onClick={generateProof}
                disabled={!selectedMember || !signal.trim() || signalBytes > 31 || busy === "proof" || busy === "verify"}
              >
                {busy === "proof" ? <><span className="spinner" /> Generating proof…</> : <>Generate ZK proof <ArrowRight size={17} /></>}
              </button>

              <div className="process-line">
                <span className={proofResult ? "done" : ""}>1. Identity secret</span><i />
                <span className={proofResult ? "done" : ""}>2. Merkle membership</span><i />
                <span className={proofResult ? "done" : ""}>3. ZK proof</span>
              </div>
            </div>

            {proofResult && (
              <div className="proof-card">
                <div className="result-heading">
                  <span className="result-icon"><FileCheck2 size={17} /></span>
                  <div><strong>Proof generated</strong><small>Semaphore Groth16 proof</small></div>
                  <button className="icon-button" type="button" onClick={copyProof} title="Copy proof JSON" aria-label="Copy proof JSON">
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <div className="proof-meta">
                  <Meta label="GROUP ROOT" value={short(proofResult.preview.groupRoot, 13, 8)} />
                  <Meta label="SCOPE" value={short(proofResult.preview.scope, 13, 8)} />
                  <Meta label="NULLIFIER" value={short(proofResult.preview.nullifier, 13, 8)} />
                </div>
                <button className="secondary-button full-button" type="button" onClick={verifyProof} disabled={busy === "verify"}>
                  {busy === "verify" ? <><span className="spinner dark" /> Verifying…</> : <>Verify and record vote <ArrowRight size={16} /></>}
                </button>
              </div>
            )}

            {verifyResult && (
              <div className={`verification-result ${verifyResult.valid ? "success" : "failure"}`} role="status">
                {verifyResult.valid ? <CircleCheck size={19} /> : <CircleX size={19} />}
                <div>
                  <strong>{verifyResult.valid ? "Vote verified" : "Verification rejected"}</strong>
                  <p>{verifyResult.message || verifyResult.error}</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon, label, value, mono }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <div className="stat-label">{label}</div>
        <div className={`stat-value ${mono ? "mono" : ""}`} title={String(value)}>{value}</div>
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return <div className="meta-item"><span>{label}</span><code>{value}</code></div>;
}
