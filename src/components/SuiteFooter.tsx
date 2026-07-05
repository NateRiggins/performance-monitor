// Suite-wide footer: static shortcuts to every AMG tool + doc, on every page, so you can hop
// between apps without returning to the Command Center. Identical across all apps.
const LINKS = [
  { name: 'Command Center', url: 'https://command-center-ecru-delta.vercel.app', icon: '🧭' },
  { name: 'Health', url: 'https://health-monitor-eight-xi.vercel.app/', icon: '🔍' },
  { name: 'Performance', url: 'https://performance-monitor-tau.vercel.app/', icon: '⚡' },
  { name: 'Crawlers', url: 'https://crawl-monitor-eta.vercel.app/', icon: '🕷️' },
  { name: 'Buckets', url: 'https://bucket-manager-lime.vercel.app/', icon: '🪣' },
  { name: 'SWAT', url: 'https://swat-omega.vercel.app/', icon: '🛰️' },
  { name: 'AMG Suite', url: 'https://abstraktmg.github.io/amg-docs/', icon: '📚' },
  { name: 'Developer SOPs', url: 'https://developer-sops.vercel.app/', icon: '📘' },
];

export default function SuiteFooter() {
  return (
    <footer className="mt-20 border-t border-neutral-800 bg-neutral-900/20">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {LINKS.map((it) => (
            <a
              key={it.url}
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-neutral-400 transition hover:text-white"
            >
              <span className="text-base">{it.icon}</span>
              {it.name}
            </a>
          ))}
        </nav>
        <div className="mt-8 text-center text-xs text-neutral-600">AMG Command Center — developer tools</div>
      </div>
    </footer>
  );
}
