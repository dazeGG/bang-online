import type { ReactNode } from 'react';
import { ThemeSwitch } from './theme.js';

export type SaloonVariant = 'home' | 'join' | 'lobby' | 'result' | 'plain';

/** Full-screen saloon frame: illustrated hero beside (or above) a scrolling paper panel. */
export function SaloonLayout({
  variant,
  title,
  lead,
  eyebrow,
  lantern = false,
  busy = false,
  children,
}: {
  variant: SaloonVariant;
  title: ReactNode;
  lead?: ReactNode;
  eyebrow?: string;
  lantern?: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`saloon saloon--${variant}`}>
      <header className="saloon-mast">
        <a className="brand" href="/" aria-label="Bang! — главная">
          BANG!
        </a>
        <ThemeSwitch />
      </header>
      <div className="saloon-body">
        <section className="saloon-hero" aria-labelledby="page-title">
          <div className="saloon-hero-text">
            {eyebrow && <span className="saloon-eyebrow">{eyebrow}</span>}
            <h1 id="page-title">{title}</h1>
            {lead && <p className="saloon-lead">{lead}</p>}
          </div>
        </section>
        <section className="saloon-panel" aria-busy={busy || undefined}>
          {lantern && (
            <img
              className="saloon-lantern"
              src="/art/hat-lantern.webp"
              alt=""
              width="700"
              height="350"
            />
          )}
          <div className="saloon-panel-inner">{children}</div>
        </section>
      </div>
    </div>
  );
}
