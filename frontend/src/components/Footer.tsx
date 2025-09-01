// components/Footer.tsx
import Link from "next/link";
import { Github, Twitter } from "lucide-react";

type NavLink = { href: string; label: string };
type SocialLink = { href: string; label: string; Icon: typeof Github };

const legalLinks: NavLink[] = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

const socialLinks: SocialLink[] = [
  { href: "https://github.com/your-org/intervue-ai", label: "GitHub", Icon: Github },
  { href: "https://x.com/your-handle", label: "Twitter", Icon: Twitter },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border">
      <div className="container py-8 flex flex-col items-center gap-4 text-center">
        {/* Brand + tagline */}
        <p className="text-sm text-muted-foreground">
          <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text font-semibold text-transparent">
            Intervue.AI
          </span>{" "}
          — Mock interviews with real insights. © {year}
        </p>

        {/* Legal only */}
        <nav aria-label="Footer navigation" className="text-sm">
          <ul className="flex flex-wrap items-center justify-center gap-3 text-muted-foreground">
            {legalLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="rounded-md px-1 hover:text-foreground focus-ring">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Socials */}
        <div className="flex items-center justify-center gap-2">
          {socialLinks.map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              title={label}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/60 text-foreground/80 hover:bg-secondary focus-ring"
            >
              <Icon size={16} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
