"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const BUCKET = "Photos";

/** =========================================================
 * Admin page with FAST mode
 * - “Full” mode: multi-sample GPS (high accuracy)
 * - “Quick” mode: single-shot GPS (~5s, good enough outdoors)
 * - Remembers Section/Row between entries (localStorage)
 * - Writes location as PostGIS POINT(lon lat) + accuracy
 * ========================================================= */
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

/* ----------------------- Auth ----------------------- */
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

/* -------------------- Admin Form -------------------- */
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
  const [status, setStatus] = useState(""); // small status line (mode + accuracy)
  const [permState, setPermState] = useState("unknown");

  // Remember last section/row for speed
  useEffect(() => {
    try {
      const last = JSON.parse(localStorage.getItem("sl_last_section_row") || "{}");
      setForm((f) => ({
        ...f,
        section_code: last.section_code || f.section_code,
        row: last.row || f.row,
      }));
    } catch {}
  }, []);
  useEffect(() => {
    const payload = { section_code: form.section_code || "", row: form.row || "" };
    localStorage.setItem("sl_last_section_row", JSON.stringify(payload));
  }, [form.section_code, form.row]);

  // Preflight permission
  useEffect(() => {
    (async () => {
      try {
        if ("permissions" in navigator && navigator.permissions.query) {
          const p = await navigator.permissions.query({ name: "geolocation" });
          setPermState(p.state); // granted/denied/prompt
          p.onchange = () => setPermState(p.state);
        }
      } catch {}
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

  /** FULL mode: multi-sample (best-of-many) */
  function captureBestLocation({
    maxWaitMs = 30000,
    targetAcc = 20,
    hardMaxAcc = 80,
  } = {}) {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("Geolocation not supported."));
      let best = null;
      let done = false;

      const win = (sample) => {
        if (done) return;
        done = true;
        clear();
        resolve(sample);
      };
      const lose = (err) => {
        if (done) return;
        done = true;
        clear();
        reject(err);
      };
      const onSample = (pos) => {
        const s = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy ?? 99999,
        };
        if (!best || s.acc < best.acc) best = s;
        setStatus(`Full GPS: best ±${Math.round(best.acc)} m`);
        if (best.acc <= targetAcc) win(best);
      };

      // Trigger prompt early if needed
      if (permState === "prompt") {
        navigator.geolocation.getCurrentPosition(
          () => {},
          () => {},
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }

      // Start watch
      const watchId = navigator.geolocation.watchPosition(
        onSample,
        () => {},
        { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 }
      );

      // Fallback one-shot
      navigator.geolocation.getCurrentPosition(
        onSample,
        () => {},
        { enableHighAccuracy: true, timeout: Math.min(12000, maxWaitMs), maximumAge: 0 }
      );

      const timer = setTimeout(() => {
        if (best) {
          if (best.acc > hardMaxAcc) lose(new Error(`GPS too coarse (±${Math.round(best.acc)} m)`));
          else win(best);
        } else {
          lose(new Error("No GPS samples. Move outdoors and enable Precise Location."));
        }
      }, maxWaitMs + 500);

      function clear() {
        navigator.geolocation.clearWatch(watchId);
        clearTimeout(timer);
      }
    });
  }

  /** QUICK mode: single-shot (~5s), accept up to ±100m */
  function captureQuickLocation({
    timeoutMs = 5000,
    maxAcc = 100,
  } = {}) {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("Geolocation not supported."));
      // Trigger prompt if needed
      if (permState === "prompt") {
        navigator.geolocation.getCurrentPosition(
          () => {},
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const acc = pos.coords.accuracy ?? 99999;
          setStatus(`Quick GPS: ±${Math.round(acc)} m`);
          if (acc > maxAcc) {
            // still allow save, just mark coarse
            resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc, coarse: true });
          } else {
            resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc, coarse: false });
          }
        },
        (err) => reject(new Error(err?.message || "Unable to get quick GPS.")),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
      );
    });
  }

  async function saveRecord(gps, sourceLabel) {
    const full_name = `${(form.given_names || "").trim()} ${(form.family_name || "").trim()}`
      .replace(/\s+/g, " ")
      .trim();
    if (!full_name) throw new Error("Please enter at least a first name or a surname.");

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
      location: `SRID=4326;POINT(${gps.lon} ${gps.lat})`,
      location_accuracy_m: gps.acc ?? null,
      location_source: sourceLabel,
      // if quick+coarse, flag for a later precise pass
      needs_precise_location: gps.coarse ? true : false,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("burials")
      .insert(payload)
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    const burialId = inserted.id;

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

    // Reset (keep section/row to speed next entry)
    setForm((f) => ({
      given_names: "",
      family_name: "",
      dob: "",
      dod: "",
      year: "",
      section_code: f.section_code, // keep
      row: f.row,                   // keep
      plot: "",
      grave_reference: "",
      notes: "",
      photo: null,
    }));
  }

  async function onSubmitFull(e) {
    e.preventDefault();
    setSaving(true);
    setStatus("Full GPS: working…");
    try {
      const gps = await captureBestLocation({ maxWaitMs: 30000, targetAcc: 20, hardMaxAcc: 80 });
      await saveRecord(gps, "gps_full");
      alert("Saved (Full) ✅");
      setStatus("");
    } catch (err) {
      console.error(err);
      alert("Save failed: " + err.message);
      setStatus("");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitQuick(e) {
    e.preventDefault();
    setSaving(true);
    setStatus("Quick GPS: working…");
    try {
      const gps = await captureQuickLocation({ timeoutMs: 5000, maxAcc: 100 });
      await saveRecord(gps, gps.coarse ? "gps_quick_coarse" : "gps_quick");
      alert("Saved (Quick) ✅");
      setStatus("");
    } catch (err) {
      console.error(err);
      alert("Save failed: " + err.message);
      setStatus("");
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
            {status ? ` • ${status}` : ""}
          </p>
          <p className="text-xs text-gray-500">
            Tip: use <span className="font-medium">Save (Quick)</span> to fly through entries,
            and come back later for a precise pass if needed.
          </p>
        </div>
        <button onClick={signOut} className="text-sm underline">Sign out</button>
      </div>

      <form className="space-y-4 mt-2">
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
            <input type="date" name="dob" value={form.dob} onChange={onChange} className="mt-1 w-full border rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Date of death</label>
            <input type="date" name="dod" value={form.dod} onChange={onChange} className="mt-1 w-full border rounded p-2" />
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
            <input name="section_code" value={form.section_code} onChange={onChange} className="mt-1 w-full border rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Row</label>
            <input name="row" value={form.row} onChange={onChange} className="mt-1 w-full border rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Plot</label>
            <input name="plot" value={form.plot} onChange={onChange} className="mt-1 w-full border rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Grave ref (optional)</label>
            <input name="grave_reference" value={form.grave_reference} onChange={onChange} className="mt-1 w-full border rounded p-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Notes (optional)</label>
          <textarea name="notes" value={form.notes} onChange={onChange} className="mt-1 w-full border rounded p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium">Headstone photo (optional)</label>
          <input type="file" accept="image/*" name="photo" onChange={onChange} className="mt-1 w-full border rounded p-2" />
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            onClick={onSubmitQuick}
            disabled={saving}
            className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save (Quick – 5s GPS)"}
          </button>

          <button
            onClick={onSubmitFull}
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save (Full – Best GPS)"}
          </button>
        </div>
      </form>
    </div>
  );
}
