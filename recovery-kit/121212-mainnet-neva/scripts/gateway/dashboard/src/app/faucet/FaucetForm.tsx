'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { requestFaucetAction, FaucetState } from '@/lib/faucet';

const initialState: FaucetState = { status: 'idle' };

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending || disabled}>
      {pending ? 'Sending…' : 'Request tokens'}
    </button>
  );
}

export default function FaucetForm({ siteKey }: { siteKey: string }) {
  const [state, formAction] = useFormState(requestFaucetAction, initialState);
  const widgetRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!siteKey) return;
    const scriptId = 'cf-turnstile-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      document.body.appendChild(script);
    }

    const renderWidget = () => {
      if (window.turnstile && widgetRef.current && !widgetRef.current.dataset.rendered) {
        widgetRef.current.dataset.rendered = 'true';
        window.turnstile.render(widgetRef.current, {
          sitekey: siteKey,
          action: 'faucet_claim',
          callback: (t: string) => setToken(t),
        });
      }
    };
    const interval = setInterval(renderWidget, 300);
    return () => clearInterval(interval);
  }, [siteKey]);

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <form action={formAction} className="field-row">
        <div className="field" style={{ flex: 1, minWidth: 280 }}>
          <label htmlFor="address">Wallet address</label>
          <input id="address" className="input" name="address" placeholder="0x..." required pattern="^0x[a-fA-F0-9]{40}$" />
        </div>

        <input type="hidden" name="turnstileToken" value={token} />
        <div ref={widgetRef} />

        <SubmitButton disabled={!token} />
      </form>

      {state.status === 'success' && (
        <div className="alert alert-success" style={{ marginTop: '1rem', marginBottom: 0 }}>
          {state.message}
          {state.txHash && (
            <div className="pre-box" style={{ marginTop: '0.6rem' }}>
              {state.explorerUrl ? (
                <a href={state.explorerUrl} target="_blank" rel="noreferrer">
                  {state.txHash}
                </a>
              ) : (
                state.txHash
              )}
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
