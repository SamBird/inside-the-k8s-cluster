import { ReactNode } from "react";

interface PageHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}

export function PageHero({ eyebrow, title, description, children }: PageHeroProps) {
  return (
    <header className="hero-header reveal-1">
      <div className="hero-copy">
        <span className="hero-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children ? (
        <div className="hero-side">
          <div className="hero-status">{children}</div>
        </div>
      ) : null}
    </header>
  );
}
