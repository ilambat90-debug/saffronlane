"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Public landing + search
 * - Searches ONLY given_names (first name) and family_name (surname)
 * - Optional year filter
 * - Mobile responsive UI
 */
export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  const [form, setForm] = useState({
    given_names: "",
    family_name: "",
    dob: "",
    dod: "",
    year: "",
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // Optional connection test (shows in console)
  useEffect(() => {
    (async () => {
      const { error } = await supabase.from("burials").select("id").limit(1);
      if (error) console.error("Supabase error:", error.message);
    })();
  }, []);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function onSearch(e) {
    e.preventDefault();
    setSubmitted(true);
    setError("");
    setLoading(true);

    try {
      // Base select: we’ll construct display name from first+surname
      let query = supabase.from("burials").select(`
        id,
        given_names,
        family_name,
        year_of_death,
        section_code,
        row,
        plot,
        grave_reference,
        notes
      `);

      // FIRST NAME — partial, case-insensitive
      if (form.given_names.trim()) {
        query = query.ilike("given_names", `%${form.given_names.trim()}%`);
      }

      // SURNAME — partial, case-insensitive
      if (form.family_name.trim()) {
        query = query.ilike("family_name", `%${form.family_name.trim()}%`);
      }

      // YEAR (optional exact)
      if (form.year.trim()) {
        const yearNum = Number(form.year.trim());
        if (!Number.isNaN(yearNum)) {
          query = query.eq("year_of_death", yearNum);
        }
      }

      // TODO: add DoB/DoD filtering later if you decide the column types

      const { data, error } = await query.order("family_name", { ascending: true }).limit(50);
      if (error) throw error;

      setResults(
        (data || []).map((r) => ({
          id: r.id,
          // display name only for rendering; NOT used for search logic
          display_name: `${r.given_names ?? ""} ${r.family_name ?? ""}`.trim(),
          year_of_death: r.year_of_death,
          section_code: r.section_code,
          row: r.row,
          plot: r.plot,
          grave_reference: r.grave_reference,
          notes: r.notes,
        }))
      );
    } catch (err) {
      console.error(err);
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function ResultCard({ r }) {
    return (
      <a
        href={`/grave/${r.id}`}
        className="block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-semibold tracking-tight">
              {r.display_name || "Name unavailable"}
            </h3>
            <p className="text-sm text-gray-600">
              {r.year_of_death ? `Year of death: ${r.year_of_death}` : "Year unknown"}
            </p>
            <p className="text-sm text-gray-700">
              Section <span className="font-medium">{r.section_code ?? "?"}</span>
              {r.row ? ` · Row ${r.row}` : ""}
              {r.plot ? ` · Plot ${r.plot}` : ""}
              {r.grave_reference ? ` · Ref ${r.grave_reference}` : ""}
            </p>
            {r.notes ? <p className="text-sm text-gray-500 mt-1 line-clamp-2">{r.notes}</p> : null}
          </div>
          <span className="self-start inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
            View details →
          </span>
        </div>
      </a>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/80 border-b border-gray-100">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-blue-600/90 text-white grid place-items-center font-bold">SL</div>
            <p className="font-semibold tracking-tight">Saffron Hill Cemetery</p>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <a className="hover:text-gray-900" href="#search">Search</a>
            <a className="hover:text-gray-900" href="#how">How it works</a>
            <a className="hover:text-gray-900" href="#privacy">Privacy</a>
          </nav>

          {/* Mobile hamburger */}
          <button
            aria-label="Open menu"
            className="md:hidden rounded-lg p-2 hover:bg-gray-100"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="block h-0.5 w-6 bg-gray-800 mb-1"></span>
            <span className="block h-0.5 w-6 bg-gray-800 mb-1"></span>
            <span className="block h-0.5 w-6 bg-gray-800"></span>
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <nav className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-2 text-sm">
              <a className="py-2 hover:text-gray-900" href="#search" onClick={() => setMenuOpen(false)}>Search</a>
              <a className="py-2 hover:text-gray-900" href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
              <a className="py-2 hover:text-gray-900" href="#privacy" onClick={() => setMenuOpen(false)}>Privacy</a>
            </nav>
          </div>
        )}
      </header>

      {/* Hero + Search */}
      <section className="mx-auto max-w-6xl px-4 pt-8 pb-8 md:pt-14 md:pb-12">
        <div className="grid gap-8 md:grid-cols-2 md:gap-10 items-start">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
              Find your loved ones at <span className="text-blue-600">Saffron Hill Cemetery</span>
            </h1>
            <p className="mt-3 sm:mt-4 text-base sm:text-lg text-slate-700 leading-relaxed">
              Search by name and date to locate graves with clear section, row, and plot details.
              Built by locals, for locals.
            </p>
            <ul className="mt-5 sm:mt-6 text-slate-700 grid gap-2">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                Works on your phone while you’re at the cemetery
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                Optional photos of the headstone or section sign
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                Turn-by-turn walking guidance coming soon
              </li>
            </ul>
          </div>

          {/* Search card */}
          <div className="md:pl-2">
            <div id="search" className="rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-md">
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight">Search the register</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Enter any details you know. One field is enough.</p>

              <form className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={onSearch}>
                <div>
                  <label className="block text-sm font-medium text-gray-700">First name</label>
                  <input
                    name="given_names"
                    value={form.given_names}
                    onChange={onChange}
                    className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    placeholder="e.g., Fatima"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Surname</label>
                  <input
                    name="family_name"
                    value={form.family_name}
                    onChange={onChange}
                    className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    placeholder="e.g., Khan"
                    autoComplete="off"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Year (if exact date unknown)</label>
                  <input
                    name="year"
                    inputMode="numeric"
                    pattern="\d*"
                    value={form.year}
                    onChange={onChange}
                    className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    placeholder="e.g., 2004"
                  />
                </div>

                <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
                  <p className="text-xs text-gray-500">Tip: Partial names work. We’ll show the closest matches.</p>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-white font-medium shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/30 disabled:opacity-60"
                  >
                    {loading ? "Searching…" : "Search"}
                  </button>
                </div>
              </form>

              {/* Results */}
              {submitted && (
                <div className="mt-4 sm:mt-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">Results</h3>
                    <span className="text-xs text-gray-500">
                      {loading ? "Please wait…" : `${results.length} found`}
                    </span>
                  </div>

                  <div className="grid gap-3">
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                    {!loading && results.length === 0 && (
                      <p className="text-sm text-gray-500">No matches yet. Try a different spelling or add a year.</p>
                    )}
                    {results.map((r) => (
                      <ResultCard key={r.id} r={r} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
          {[
            {
              title: "Community-built",
              body:
                "Volunteers carefully record names, section, row, plot, and—where possible—a precise GPS point near the headstone.",
            },
            {
              title: "Simple to use",
              body:
                "Search by name and dates. We’ll show the section and the best route from the entrance. Photos are added when available.",
            },
            {
              title: "Always improving",
              body:
                "If something looks wrong, report it and we’ll fix it. We plan to add turn-by-turn walking guidance next.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-700">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="mx-auto max-w-6xl px-4 pb-12 md:pb-14">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
          <h3 className="font-semibold">Privacy & Respect</h3>
          <p className="mt-2 text-sm text-gray-700">
            We publish minimal information about the deceased and remove or correct entries on request.
            Please contact us if you spot mistakes or would prefer a record to be hidden.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-gray-600 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-center md:text-left">© {new Date().getFullYear()} Saffron Hill Cemetery – Leicester</p>
          <div className="flex items-center gap-5">
            <a className="hover:text-gray-900" href="#privacy">Privacy</a>
            <a className="hover:text-gray-900" href="#how">How it works</a>
            <a className="hover:text-gray-900" href="mailto:hello@example.com">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
