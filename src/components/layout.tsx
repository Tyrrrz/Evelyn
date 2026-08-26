import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface LayoutProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}

export default function Layout({ title, subtitle, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          <Link to="/" className="text-amber-400 hover:text-amber-300">
            Evelyn
          </Link>
          {title && (
            <>
              <span className="mx-2 font-normal text-zinc-600">/</span>
              <span className="font-normal text-zinc-300">{title}</span>
            </>
          )}
        </h1>
        {subtitle && <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>}
      </header>

      <main className="mx-auto max-w-screen-2xl px-6 py-6">{children}</main>
    </div>
  );
}
