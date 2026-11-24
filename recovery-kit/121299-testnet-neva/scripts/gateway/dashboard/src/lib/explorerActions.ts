'use server';

import { redirect } from 'next/navigation';

export async function explorerSearchAction(formData: FormData): Promise<void> {
  const q = String(formData.get('q') ?? '').trim();

  if (/^\d+$/.test(q)) {
    redirect(`/explorer/block/${q}`);
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(q)) {
    redirect(`/explorer/tx/${q}`);
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
    redirect(`/explorer/address/${q}`);
  }
  redirect('/explorer?error=notfound');
}
