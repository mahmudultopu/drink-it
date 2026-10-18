// Thin fetch wrapper for the JSON API.
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Network error — please check your connection and try again.'), { status: 0 });
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok)
    throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), {
      status: res.status,
      fields: data.fields,
      data,
    });
  return data;
}

let bootPromise;
/**
 * Everything a page needs before it can render, fetched once per page load: the shared catalogue (cacheable, and
 * preloaded by the page head) and the logged-in customer (per visitor, never cached). A failing /me call only means
 * "not logged in" - it must not stop the shop from loading.
 */
export function bootstrap() {
  bootPromise ||= Promise.all([api('/catalogue'), api('/me').catch(() => ({ user: null }))]).then(
    ([catalogue, me]) => ({ ...catalogue, user: me.user }),
  );
  return bootPromise;
}
