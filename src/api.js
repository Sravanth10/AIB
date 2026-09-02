async function req(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const api = {
  bootstrap: () => req('/api/bootstrap'),
  createSpace: (month) => req(`/api/spaces/${month}`, { method: 'POST' }),
  uploads: (month) => req(`/api/uploads/${month}`),
  analysis: (month) => req(`/api/analysis/${month}`),

  upload(month, files) {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    return req(`/api/uploads/${month}`, { method: 'POST', body: form });
  },

  stageSamples: (month, heldBack = false) =>
    req(`/api/uploads/${month}/samples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heldBack }),
    }),

  correct: (month, uploadId, payload) =>
    req(`/api/uploads/${month}/${uploadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  remove: (month, uploadId) => req(`/api/uploads/${month}/${uploadId}`, { method: 'DELETE' }),
  generate: (month) => req(`/api/generate/${month}`, { method: 'POST' }),
};
