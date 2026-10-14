// A highlighted radar item should open alone, not alongside the whole board.
export function notificationDestination(path: string): string {
  if (!/^\/app(?:\/|\?|$)/.test(path) || path.includes('\\')) return '/app/radar';
  const url = new URL(path, 'https://licitaro.invalid');
  if (url.pathname === '/app/radar') {
    const id = url.searchParams.get('highlight');
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return `/app/radar/${id}`;
  }
  return url.pathname + url.search + url.hash;
}