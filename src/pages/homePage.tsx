import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          <span className="text-amber-400">Evelyn</span>
        </h1>
        <p className="mt-2 text-lg text-zinc-400">EVE Online toolkit</p>
      </header>

      <div className="grid w-full max-w-sm gap-4">
        <Link
          to="/lp"
          className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-amber-500 hover:bg-zinc-800"
        >
          <span className="font-semibold text-zinc-100">LP Store</span>
          <span className="text-sm text-zinc-500">
            Find the most profitable LP-to-ISK exchanges for your NPC corporation
          </span>
        </Link>
        <Link
          to="/appraisal"
          className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-amber-500 hover:bg-zinc-800"
        >
          <span className="font-semibold text-zinc-100">Item Appraisal</span>
          <span className="text-sm text-zinc-500">
            Paste a list of items from your inventory to get their Buy/Sell prices and totals
          </span>
        </Link>
      </div>
    </div>
  );
}
