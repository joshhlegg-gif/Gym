import { signIn, signUp } from '../actions';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkEmail?: string }>;
}) {
  const { error, checkEmail } = await searchParams;

  return (
    <main className="mx-auto max-w-sm pt-16">
      <h1 className="text-2xl font-semibold tracking-tight">Gym</h1>
      <p className="mt-1 text-sm text-muted">Training and body composition.</p>

      {checkEmail ? (
        <p className="mt-6 rounded-lg border border-line px-4 py-3 text-sm">
          Check your email for a confirmation link.
        </p>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-lg border border-line px-4 py-3 text-sm text-muted">{error}</p>
      ) : null}

      <form className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-lg border border-line bg-transparent px-3 py-2.5 text-base outline-none focus:border-trend"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="current-password"
            className="rounded-lg border border-line bg-transparent px-3 py-2.5 text-base outline-none focus:border-trend"
          />
        </label>

        <button
          formAction={signIn}
          className="mt-2 rounded-lg bg-trend px-4 py-3 font-medium text-paper"
        >
          Sign in
        </button>
        <button formAction={signUp} className="text-sm text-muted underline underline-offset-4">
          Create an account
        </button>
      </form>
    </main>
  );
}
