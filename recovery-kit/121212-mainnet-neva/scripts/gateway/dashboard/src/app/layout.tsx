import { ReactNode } from 'react';
import { getSession } from '@/lib/auth';
import { logoutAction } from '@/lib/actions';
import { ensureBootstrapAdminOnce } from '@/lib/bootstrap';
import './globals.css';

export const metadata = {
  title: 'HARA Mainnet Gateway',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await ensureBootstrapAdminOnce();
  const session = await getSession();

  return (
    <html lang="en">
      <body>
        {session && (
          <nav className="navbar">
            <span className="brand">
              HARA <span className="brand-dot">Mainnet</span>
            </span>
            <a className="nav-link" href="/users">Users</a>
            <a className="nav-link" href="/api-keys">API Keys</a>
            <a className="nav-link" href="/usage">Usage</a>
            <a className="nav-link" href="/activity">Activity</a>
            <a className="nav-link" href="/recipients">Faucet Recipients</a>
            <a className="nav-link" href="/alert-recipients">Alerts</a>
            <a className="nav-link" href="https://explorer.registry.haratoken.app" target="_blank" rel="noopener">Explorer ↗</a>
            <a className="nav-link" href="https://netstats.registry.haratoken.app" target="_blank" rel="noopener">Netstats ↗</a>
            <a className="nav-link" href="/grafana">Grafana</a>
            <span className="spacer" />
            <span className="session-email">{session.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-sm">
                Logout
              </button>
            </form>
          </nav>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
