// Em desenvolvimento, ?api=http://127.0.0.1:PORTA aponta a interface para outro backend (testes isolados).
const devApiOverride = import.meta.env?.DEV ? new URLSearchParams(globalThis.location?.search || "").get("api") : "";
export const API = devApiOverride || "http://127.0.0.1:38717";

export async function postAPI(path, body = {}) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data?.error || "Erro no backend");
  }
  return data;
}

export async function getAPI(path) {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(8000) });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data?.error || "Erro no backend");
  }
  return data;
}
