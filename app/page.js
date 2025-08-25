"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState({
    given_names: "",
    family_name: "",
    year: "",
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

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
      // Search by first/last name (ilike = case-insensitive, partial)
      let query = supabase.from("burials").select(`
        id, full_name, year_of_death, section_code, row, plot, grave_reference, notes
      `);

      if (form.given_names.trim()) {
        query = query.ilike("given_names", `%${form.given_names.trim()}%`);
      }
      if (form.family_name.trim()) {
        query = query.ilike("family_name", `%${form.family_name.trim()}%`);
      }
      if (form.year.trim()) {
        query = query.eq("year_of_death", form.year.trim());
      }

      const { data, error: qErr } = await query.limit(30);
      if (qErr) throw qErr;

      setResults(data || []);
    } catch (err) {
      console.error(err);
      setError("Sorry, we couldn’t run that search. Please try again.");
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
            <h3 className="text-base sm:text-lg font-semibold tracking-tight">{r.full_name}</h3>
            <p className="text-sm text-gray-600">
              {r.year_of_death ? `Year of death: ${r.year_of_death}` : "Year unknown"}
            </p>
            <p className="text-sm text-gray-700">
              Section <span className="font-medium">{r.section_code ?? "?"}</span>
              {r.row ? ` · Row ${r.row}` : ""}{r.plot ? ` · Plot ${r.plot}` : ""}
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
            <a className="hover:text-gray-900" href="#about">About</a>
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

        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <nav className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-2 text-sm">
              <a className="py-2 hover:text-gray-900" href="#search" onClick={() => setMenuOpen(false)}>Search</a>
              <a className="py-2 hover:text-gray-900" href="#about" onClick={() => setMenuOpen(false)}>About</a>
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
              Never lose your way when paying respects
            </h1>
            <p className="mt-3 sm:mt-4 text-base sm:text-lg text-slate-700 leading-relaxed">
              Many of us visit Saffron Hill Cemetery and, with the passing of time, can’t remember the exact place
              where our friends or family are buried. This project was built for the community to solve that problem:
              search a name, see the location, and get directions straight to the graveside.
            </p>


            <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              This is a community effort offered sincerely for everyone’s benefit.  
              All the creator asks in return is your <span className="font-semibold">duas/prayers</span> and that it serves its purpose.
            </div>
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
                      <p className="text-sm text-gray-500">
                        No matches yet. Try a different spelling or add a year.
                      </p>
                    )}
                    {results.map((r) => <ResultCard key={r.id} r={r} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
          <h3 className="font-semibold text-lg">Built with care for the community</h3>
          <p className="mt-2 text-sm text-gray-700">
            Volunteers are recording names, section, row, plot and—where possible—a precise GPS point at the graveside.
            If you spot any mistakes, or would prefer a record to be hidden, please contact us and we’ll put it right.
          </p>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="mx-auto max-w-6xl px-4 pb-12 md:pb-14">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
          <h3 className="font-semibold">Privacy & Respect</h3>
          <p className="mt-2 text-sm text-gray-700">
            We publish minimal information and will remove or correct entries on request. This project exists to help
            families pay their respects with ease and dignity.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-gray-600 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-center md:text-left">© {new Date().getFullYear()} Saffron Hill Cemetery – Leicester</p>
          <div className="flex items-center gap-5">
            <a className="hover:text-gray-900" href="#privacy">Privacy</a>
            <a className="hover:text-gray-900" href="#about">About</a>
            <a className="hover:text-gray-900" href="mailto:hello@example.com">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
