import FaucetForm from './FaucetForm';

export const dynamic = 'force-dynamic';

export default function FaucetPage() {
  const siteKey = process.env.TURNSTILE_SITE_KEY ?? '';

  return (
    <div className="page">
      <h1 className="page-title">HARA Faucet</h1>
      <p className="page-subtitle">
        Request test funds for a whitelisted wallet. Only addresses added to the on-chain
        whitelist by an admin can claim — contact an admin if your wallet is not eligible.
      </p>
      <FaucetForm siteKey={siteKey} />
    </div>
  );
}
