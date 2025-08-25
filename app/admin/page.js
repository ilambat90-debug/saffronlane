"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const BUCKET = "Photos";

/** ─────────────────────────────────────────────────────────
 * Admin Page with robust GPS capture + diagnostics
 * - Works on HTTPS (Vercel) with Precise Location allowed
 * - Preflights permission; prompts user when needed
 * - Multi-sample watcher + single-shot fallback
 * - Stores PostGIS POINT(lon lat) in `location`
 * ───────────────────────────────────────────────────────── */
export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <main className="p-6">Loading…</main>;
  return session ? <AdminForm /> : <PasswordAuth />;
}

/* ----------------- email/password auth ----------------- */
function PasswordAuth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
  }

  return (
    <main className="max-w-sm mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Admin sign-in</h1>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <div className="grid gap-3">
        <div>
          <label className="block text-sm text-gray-700">Email</label>
          <input
            className="mt-1 w-full rounded border p-2 border-gray-300"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Password</label>
          <div className="mt-1 flex">
            <input
              className="w-full rounded-l border p-2 border-gray-300"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="rounded-r border border-l-0 px-3 text-sm"
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <button
          onClick={signIn}
          disabled={busy}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </main>
  );
}

/* --------------- Admin form with robust GPS -------------- */
function AdminForm() {
  const [form, setForm] = useState({
    given_names: "",
    family_name: "",
    dob: "",
    dod: "",
    year: "",
    section_code: "",
    row: "",
    plot: "",
    grave_reference: "",
    notes: "",
    photo: null,
  });

  const [saving, setSaving] = useState(false);

  // Diagnostics UI (so you can see what your phone is doing)
  const [permState, setPermState] = useState("unknown"); // granted | denied | prompt | unknown
  const [gpsStatus, setGpsStatus] = useState({ msg: "", samples: 0, bestAcc: null });
  const [lastBest, setLastBest] = useState(null); // {lat, lon, acc}

  useEffect(() => {
    // Preflight permission so we can explain what’s going on
    (async () => {
      try {
        if ("permissions" in navigator && navigator.permissions.query) {
          const p = await navigator.permissions.query({ name: "geolocation" });
          setPermState(p.state); // granted / denied / prompt
          p.onchange = () => setPermState(p.state);
        }
      } catch {
        setPermState("unknown");
      }
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  function onChange(e) {
    const { name, value, files } = e.target;
    if (files) setForm((f) => ({ ...f, [name]: files[0] }));
    else setForm((f) => ({ ...f, [name]: value }));
  }

  /**
   * More robust GPS capture
   * - If permission is "prompt", we first call getCurrentPosition once to trigger the prompt.
   * - Then we start watchPosition to gather multiple samples up to maxWaitMs.
   * - We also race a second getCurrentPosition as a fallback in case watch never fires.
   */
  async function captureBestLocation({
    maxWaitMs = 30000,
    targetAcc = 20,
    hardMaxAcc = 80,
  } = {}) {
    if (!("geolocation" in navigator)) {
      throw new Error("Geolocation not supported on this device/browser.");
    }

    // If permission is "prompt", trigger the prompt early
    if (permState === "prompt") {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          (err) => reject(new Error(err?.message || "Location permission denied.")),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }).catch((e) => {
        throw e;
      });
    }

    return new Promise((resolve, reject) => {
      let best = null;
      let count = 0;
      setGpsStatus({ msg: "Capturing GPS…", samples: 0, bestAcc: null });

      const onSample = (pos) => {
        count += 1;
        const s = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy ?? 99999,
          ts: pos.timestamp,
        };
        if (!best || s.acc < best.acc) best = s;
        setGpsStatus({ msg: "Capturing GPS…", samples: count, bestAcc: Math.round(best.acc) });
        if (best.acc <= targetAcc) {
          cleanup();
          setLastBest(best);
          resolve(best);
        }
      };

      let watchId = null;
      let timerId = null;
      let won = false;

      function cleanup() {
        if (won) return;
        won = true;
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        if (timerId != null) clearTimeout(timerId);
      }

      // Start watcher
      watchId = navigator.geolocation.watchPosition(onSample, (err) => {
        // watcher error -> carry on with fallback / timeout
        console.warn("watchPosition error:", err?.message);
      }, { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 });

      // Fire a single-shot fallback too (some devices never call watch quickly)
      navigator.geolocation.getCurrentPosition(
        (pos) => onSample(pos),
        (err) => console.warn("getCurrentPosition fallback error:", err?.message),
        { enableHighAccuracy: true, timeout: Math.min(12000, maxWaitMs), maximumAge: 0 }
      );

      // Final timeout
      timerId = setTimeout(() => {
        if (best) {
          setLastBest(best);
          if (best.acc > hardMaxAcc) {
            cleanup();
            reject(
              new Error(
                `GPS not accurate enough (best ±${Math.round(
                  best.acc
                )} m). Please step outside, wait ~15s, ensure Precise Location is ON, then try again.`
              )
            );
          } else {
            cleanup();
            resolve(best);
          }
        } else {
          cleanup();
          reject(
            new Error(
              "No GPS samples received. Move outdoors and enable Precise Location for your browser."
            )
          );
        }
      }, maxWaitMs + 500);
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);

    try {
      // 1) Capture GPS with diagnostics
      setGpsStatus((s) => ({ ...s, msg: "Capturing GPS…" }));
      const gps = await captureBestLocation({
        maxWaitMs: 30000,  // wait up to 30s to gather good samples
        targetAcc: 20,     // accept early if ≤20 m
        hardMaxAcc: 80,    // require ≤80 m
      });
      setGpsStatus((s) => ({ ...s, msg: `Best fix: ±${Math.round(gps.acc)} m` }));

      // 2) Compute required full_name
      const full_name = `${(form.given_names || "").trim()} ${(form.family_name || "").trim()}`
        .replace(/\s+/g, " ")
        .trim();
      if (!full_name) throw new Error("Please enter at least a first name or a surname.");

      // 3) Insert burial row
      const payload = {
        given_names: form.given_names || null,
        family_name: form.family_name || null,
        full_name,
        date_of_birth: form.dob || null,
        date_of_death: form.dod || null,
        year_of_death: form.year ? Number(form.year) : null,
        section_code: form.section_code || null,
        row: form.row || null,
        plot: form.plot || null,
        grave_reference: form.grave_reference || null,
        notes: form.notes || null,
        location: `SRID=4326;POINT(${gps.lon} ${gps.lat})`, // lon,lat order
        location_accuracy_m: gps.acc ?? null,
        location_source: "gps",
      };

      const { data: inserted, error: insertErr } = await supabase
        .from("burials")
        .insert(payload)
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      const burialId = inserted.id;

      // 4) Optional photo to Storage
      if (form.photo) {
        const ext = (form.photo.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${burialId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, form.photo, {
          cacheControl: "3600",
          upsert: false,
        });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const photoUrl = pub.publicUrl;

        const { error: mErr } = await supabase
          .from("media")
          .insert({ burial_id: burialId, type: "headstone", url: photoUrl });
        if (mErr) throw mErr;
      }

      alert("Burial record saved successfully!");
      setForm({
        given_names: "",
        family_name: "",
        dob: "",
        dod: "",
        year: "",
        section_code: "",
        row: "",
        plot: "",
        grave_reference: "",
        notes: "",
        photo: null,
      });
      setLastBest(null);
      setGpsStatus({ msg: "", samples: 0, bestAcc: null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      alert("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Add a burial record</h1>
          <p className="text-xs text-gray-600 mt-1">
            Location permission: <span className="font-medium">{permState}</span>
            {gpsStatus.msg ? ` • ${gpsStatus.msg}` : ""}
            {typeof gpsStatus.bestAcc === "number" ? ` • best ±${gpsStatus.bestAcc} m` : ""}
            {gpsStatus.samples ? ` • samples: ${gpsStatus.samples}` : ""}
          </p>
          {lastBest && (
            <p className="text-xs text-gray-500">
              Last best fix: lat {lastBest.lat.toFixed(6)}, lon {lastBest.lon.toFixed(6)}
            </p>
          )}
        </div>
        <button onClick={signOut} className="text-sm underline">Sign out</button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 mt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">First name(s)</label>
            <input
              name="given_names"
              value={form.given_names}
              onChange={onChange}
              className="mt-1 w-full border rounded p-2"
              placeholder="e.g., Fatima"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Surname</label>
            <input
              name="family_name"
              value={form.family_name}
              onChange={onChange}
              className="mt-1 w-full border rounded p-2"
              placeholder="e.g., Khan"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Date of birth</label>
            <input
              type="date"
              name="dob"
              value={form.dob}
              onChange={onChange}
              className="mt-1 w-full border rounded p-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Date of death</label>
            <input
              type="date"
              name="dod"
              value={form.dod}
              onChange={onChange}
              className="mt-1 w-full border rounded p-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Year of death (if exact date unknown)</label>
          <input
            name="year"
            value={form.year}
            onChange={onChange}
            className="mt-1 w-full border rounded p-2"
            placeholder="e.g., 2004"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium">Section</label>
            <input
              name="section_code"
              value={form.section_code}
              onChange={onChange}
              className="mt-1 w-full border rounded p-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Row</label>
            <input
              name="row"
              value={form.row}
              onChange={onChange}
              className="mt-1 w-full border rounded p-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Plot</label>
            <input
              name="plot"
              value={form.plot}
              onChange={onChange}
              className="mt-1 w-full border rounded p-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Grave ref (optional)</label>
            <input
              name="grave_reference"
              value={form.grave_reference}
              onChange={onChange}
              className="mt-1 w-full border rounded p-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Notes (optional)</label>
          <textarea
            name="notes"
            value={form.notes}
            onChange={onChange}
            className="mt-1 w-full border rounded p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Headstone photo (optional)</label>
          <input
            type="file"
            accept="image/*"
            name="photo"
            onChange={onChange}
            className="mt-1 w-full border rounded p-2"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
