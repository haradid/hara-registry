import { loginAction } from '@/lib/actions';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>HARA Gateway</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '0.88rem' }}>
          Sign in to manage testnet users and API keys.
        </p>
        <form action={loginAction}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" name="password" type="password" required />
          </div>
          {searchParams.error && <div className="alert alert-danger">Invalid email or password.</div>}
          <button type="submit" className="btn btn-primary">
            Log in
          </button>
        </form>
      </div>
    </div>
  );
}
