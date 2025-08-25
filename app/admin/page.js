"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const BUCKET = "Photos";

/** ─────────────────────────────
 * Auth gate + Admin form page
 * ───────────────────────────── */
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

/** ─────────────────────────────
 * Email + password sign-in
 * ───────────────────────────── */
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

/** ─────────────────────────────
 * Admin Form (multi-sample GPS)
 * ───────────────────────────── */
function AdminForm() {
  const [form, setForm] = useState({
    given_names: "",
    family_name: "",
    dob: "", // maps to date_of_birth
    dod: "", // maps to date_of_death
    year: "",
    section_code: "",
    row: "",
    plot: "",
    grave_reference: "",
    notes: "",
    photo: null,
  });

  const [saving, setSaving] = useState(false);
  const [gpsStatus, setGpsStatus] = useState({ msg: "", samples: 0, bestAcc: null });
  const [lastBest, setLastBest] = useState(null); // {lat, lon, acc}

  async function signOut() {
    await supabase.auth.signOut();
  }

  function onChange(e) {
    const { name, value, files } = e.target;
    if (files) setForm((f) => ({ ...f, [name]: files[0] }));
    else setForm((f) => ({ ...f, [name]: value }));
  }

  /**
   * Collect multiple GPS samples with watchPosition.
   * Returns best sample (lowest accuracy).
   * - maxWaitMs: total window to collect
   * - targetAcc: stop early if we hit this accuracy (meters)
   * - hardMaxAcc: fail if after maxWait we still worse than this accuracy
   */
  function captureBestLocation({
    maxWaitMs = 15000,
    targetAcc = 20,
    hardMaxAcc = 60,
  } = {}) {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Geolocation not supported on this device/browser."));
        return;
      }

      let best = null;
      let count = 0;
      setGpsStatus({ msg: "Capturing GPS…", samples: 0, bestAcc: null });

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          count += 1;
          const sample = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            acc: pos.coords.accuracy ?? 99999,
            ts: pos.timestamp,
          };

          if (!best || sample.acc < best.acc) best = sample;

          setGpsStatus({
            msg: "Capturing GPS…",
            samples: count,
            bestAcc: Math.round(best.acc),
          });

          // Stop early if we reached target accuracy
          if (best.acc <= targetAcc) {
            navigator.geolocation.clearWatch(watchId);
            setLastBest(best);
            resolve(best);
          }
        },
        (err) => {
          navigator.geolocation.clearWatch(watchId);
          reject(new Error(err?.message || "Unable to capture GPS."));
        },
        { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 }
      );

      // Hard timeout
      const t = setTimeout(() => {
        navigator.geolocation.clearWatch(watchId);
        if (best) {
          setLastBest(best);
          if (best.acc > hardMaxAcc) {
            reject(
              new Error(
                `GPS not accurate enough (best ±${Math.round(
                  best.acc
                )} m). Please step outside, wait a few seconds and try again.`
              )
            );
          } else {
            resolve(best);
          }
        } else {
          reject(new Error("No GPS samples received. Move outdoors and try again."));
        }
      }, maxWaitMs + 500);
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setGpsStatus((s) => ({ ...s, msg: "Capturing GPS…" }));

    try {
      // 1) MULTI-SAMPLE GPS
      const gps = await captureBestLocation({
        maxWaitMs: 15000,  // collect for up to 15s
        targetAcc: 20,     // stop early if we reach ≤20 m
        hardMaxAcc: 60,    // require ≤60 m to proceed
      });
      setGpsStatus((s) => ({
        ...s,
        msg: `Best fix: ±${Math.round(gps.acc)} m`,
      }));

      // 2) Compute full_name to satisfy NOT NULL constraint
      const full_name = `${(form.given_names || "").trim()} ${(form.family_name || "").trim()}`
        .replace(/\s+/g, " ")
        .trim();

      if (!full_name) {
        throw new Error("Please enter at least a first name or a surname.");
      }

      // 3) Insert the burial row (column names match your schema)
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
        location: `SRID=4326;POINT(${gps.lon} ${gps.lat})`, // POINT(lon lat) — correct order
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

      // 4) Optional photo upload to Storage + reference in `media`
      if (form.photo) {
        const ext = (form.photo.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${burialId}/${Date.now()}.${ext}`;

        const { error: upErr } = await supabase
          .storage
          .from(BUCKET)
          .upload(path, form.photo, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const photoUrl = pub.publicUrl;

        const { error: mediaErr } = await supabase
          .from("media")
          .insert({ burial_id: burialId, type: "headstone", url: photoUrl });
        if (mediaErr) throw mediaErr;
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
      setGpsStatus({ msg: "", samples: 0, bestAcc: null });
      setLastBest(null);
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
          {gpsStatus.msg && (
            <p className="text-xs text-gray-600 mt-1">
              {gpsStatus.msg}
              {typeof gpsStatus.bestAcc === "number" ? ` • best ±${gpsStatus.bestAcc} m` : ""}
              {gpsStatus.samples ? ` • samples: ${gpsStatus.samples}` : ""}
            </p>
          )}
          {lastBest && (
            <p className="text-xs text-gray-500">
              Last best fix: lat {lastBest.lat.toFixed(6)}, lon {lastBest.lon.toFixed(6)}
            </p>
          )}
        </div>
        <button onClick={signOut} className="text-sm underline">Sign out</button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
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
