// src/app/login/page.jsx
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Field, Input } from "../components/ui";

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not sign in");
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#0d0d10] p-6">
        <div className="mb-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(77,141,255)] text-[13px] font-bold text-white">A</div>
          <h1 className="mt-4 text-lg font-semibold text-white">Sign in to Atlas</h1>
          <p className="mt-1 text-sm text-zinc-500">This workspace is private.</p>
        </div>
        <Field label="Password" error={error}>
          {(id) => (
            <Input id={id} type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!password} className="mt-5 w-full">
          Sign in
        </Button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
