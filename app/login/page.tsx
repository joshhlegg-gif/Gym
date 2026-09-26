import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="auth-page"><form action={signIn} className="login-card"><p className="eyebrow">Personal gym logger</p><h1>Sign in</h1><p className="muted">Private access for Josh.</p>{error && <p className="error" role="alert">{error}</p>}<label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><button className="primary" type="submit">Sign in</button></form></main>;
}
