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
/** Site config + catalogue, fetched once per page load. */
export function bootstrap() {
  bootPromise = bootPromise || api('/bootstrap');
  return bootPromise;
}
