import { pool } from '@/lib/db';
import { createUserAction } from '@/lib/actions';

interface UserRow {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  status: string;
  key_count: number;
}

async function getUsers(): Promise<UserRow[]> {
  const result = await pool.query(`
    SELECT u.id, u.name, u.email, u.organization, u.status,
           COUNT(k.id)::int AS key_count
    FROM users u
    LEFT JOIN api_keys k ON k.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);
  return result.rows;
}

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <div className="page">
      <h1 className="page-title">Users</h1>
      <p className="page-subtitle">Developers and teams with access to the mainnet RPC gateway.</p>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form action={createUserAction} className="field-row">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" className="input" name="name" placeholder="Jane Doe" required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" name="email" type="email" placeholder="jane@example.com" required />
          </div>
          <div className="field">
            <label htmlFor="organization">Organization</label>
            <input id="organization" className="input" name="organization" placeholder="Optional" />
          </div>
          <button type="submit" className="btn btn-primary">
            Create user
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Organization</th>
              <th>Status</th>
              <th>API Keys</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.organization ?? '-'}</td>
                <td>
                  <span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                    {u.status}
                  </span>
                </td>
                <td>{u.key_count}</td>
                <td>
                  <a className="btn btn-sm" href={`/users/${u.id}`}>
                    Manage
                  </a>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  No users yet — create one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
