'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { requestFaucetAction, FaucetState } from '@/lib/faucet';

const initialState: FaucetState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Sending…' : 'Request tokens'}
    </button>
  );
}

export default function FaucetForm() {
  const [state, formAction] = useFormState(requestFaucetAction, initialState);

  return (
    <div className="card">
      <form action={formAction} className="field-row">
        <div className="field" style={{ flex: 1, minWidth: 280 }}>
          <label htmlFor="address">Wallet address</label>
          <input id="address" className="input" name="address" placeholder="0x..." required pattern="^0x[a-fA-F0-9]{40}$" />
        </div>
        <SubmitButton />
      </form>

      {state.status === 'success' && (
        <div className="alert alert-success" style={{ marginTop: '1rem', marginBottom: 0 }}>
          {state.message}
          {state.txHash && (
            <div className="pre-box" style={{ marginTop: '0.6rem' }}>
              {state.txHash}
            </div>
          )}
        </div>
      )}
      {state.status === 'error' && (
        <div className="alert alert-danger" style={{ marginTop: '1rem', marginBottom: 0 }}>
          {state.message}
        </div>
      )}
    </div>
  );
}
