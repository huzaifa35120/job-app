"use client";

import { useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { BrandMark } from "@/components/ui";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <div className="login">
        <div className="brand">
          <BrandMark />
          Auto Job Apply
        </div>
        <p className="muted" style={{ textAlign: "center" }}>
          Log in to see today&apos;s matches.
        </p>
        <form onSubmit={submit} className="login-card stack" style={{ gap: 16 }}>
          <div>
            <label htmlFor="u">Username</label>
            <input id="u" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div>
            <label htmlFor="p">Password</label>
            <input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error ? (
            <div className="alert" role="alert" style={{ margin: 0 }}>
              <TriangleAlert size={16} aria-hidden />
              <div>{error}</div>
            </div>
          ) : null}
          <button type="submit" className="btn-primary" style={{ height: 44 }} disabled={busy || !username || !password}>
            {busy ? (
              <>
                <LoaderCircle size={15} className="spin" aria-hidden /> Logging in…
              </>
            ) : (
              "Log in"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
