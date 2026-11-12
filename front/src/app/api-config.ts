// O build pode definir a URL pública via meta tag. Em produção, /api/ usa a mesma origem.
const configured = document.querySelector<HTMLMetaElement>('meta[name="octor-api-base"]')?.content.trim();
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const base = new URL(configured || (local ? 'http://localhost:8000/api/' : '/api/'), location.origin);
if (base.username || base.password || base.search || base.hash ||
    (base.protocol !== 'https:' && !(local && base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) {
  throw new Error('A URL da API do OCTOR deve usar HTTPS fora do ambiente local.');
}
export const API_BASE = base.href.replace(/\/$/, '');
