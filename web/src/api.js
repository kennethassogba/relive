export async function api(path, data) {
  const response = await fetch('/api/'+path, data===undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || response.statusText);
  return result;
}
export const number = n => n===undefined ? '—' : new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n);
export const ms = n => n===undefined || n===null ? '—' : n<1000 ? `${Math.round(n)} ms` : `${(n/1000).toFixed(2)} s`;
