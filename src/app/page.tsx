import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col items-center justify-center px-6">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight">
          <span className="text-amber-400">Evelyn</span>
        </h1>
        <p className="text-zinc-400 mt-2 text-lg">EVE Online toolkit</p>
      </header>
      <div className="grid gap-4 w-full max-w-sm">
        <Link
          href="/lp-store"
          className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-5 hover:border-amber-500 hover:bg-zinc-800 transition-colors"
        >
          <span className="font-semibold text-zinc-100">LP Store</span>
          <span className="text-sm text-zinc-500">
            Find the most profitable LP-to-ISK exchanges for your NPC corporation
          </span>
        </Link>
      </div>
    </div>
  );
}
