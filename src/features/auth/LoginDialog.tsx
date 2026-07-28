import { Lock, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import mytvLogo from "../../assets/mytv-logo.png";
import { login } from "../../lib/auth";

interface LoginDialogProps {
  onSuccess: () => void;
}

export function LoginDialog({ onSuccess }: LoginDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const ok = login(username, password);
    if (!ok) {
      setError("Sai tài khoản hoặc mật khẩu.");
      setSubmitting(false);
      return;
    }

    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0f19]/95 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/80 p-8 shadow-2xl shadow-sky-950/40">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={mytvLogo}
            alt="MyTV"
            className="mb-4 h-14 w-auto drop-shadow-md"
            width={63}
            height={56}
          />
          <p className="text-sm uppercase tracking-[0.2em] text-sky-400">MyTV Stats</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-400">
            Nhập tài khoản để xem thống kê Google Play reviews.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-slate-300">
            Tài khoản
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
            />
          </label>

          <label className="block text-sm text-slate-300">
            Mật khẩu
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || !username.trim() || !password}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
          >
            {submitting ? (
              <Lock size={16} />
            ) : (
              <LogIn size={16} />
            )}
            Đăng nhập
          </button>
        </form>
      </div>
    </div>
  );
}
