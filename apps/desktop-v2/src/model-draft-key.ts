export async function modelDraftKey(providerId: string, profileId?: string): Promise<string> {
  if (profileId !== undefined && !/^[a-f0-9]{64}$/.test(profileId))
    throw Error('A verified profile identity is required for model drafts.');
  const source =
    profileId === undefined ? providerId : JSON.stringify(['model-editor', profileId, providerId]);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return (
    'model-editor:' +
    [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('')
  );
}
