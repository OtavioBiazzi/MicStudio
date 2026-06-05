export const API = "http://127.0.0.1:38717";

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
  const res = await fetch(`${API}${path}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data?.error || "Erro no backend");
  }
  return data;
}
