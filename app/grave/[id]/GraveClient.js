"use client";

import { useMemo, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Map, Marker, NavigationControl } from "react-map-gl/maplibre";

const MAP_STYLE = "https://demotiles.maplibre.org/style.json";

export default function GraveClient({ burial }) {
  // Expected shape (from your server wrapper):
  // burial = {
  //   id, full_name, year_of_death, section_code, row, plot, grave_reference, notes,
  //   lat, lon,
  //   photos: [{ url, type }]
  // }

  const [zoom] = useState(18);

  const {
    full_name,
    year_of_death,
    section_code,
    row,
    plot,
    grave_reference,
    notes,
    lat,
    lon,
    photos = [],
  } = burial || {};

  const hasCoords = typeof lat === "number" && typeof lon === "number";

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-3xl font-bold tracking-tight">{full_name}</h1>

      <p className="mt-1 text-gray-700">
        {year_of_death ? <>Year of death: {year_of_death}</> : <>Year of death: unknown</>}
      </p>
      <p className="text-gray-700">
        {section_code ? <>Section {section_code}</> : <>Section ?</>}
        {row ? <> · Row {row}</> : null}
        {plot ? <> · Plot {plot}</> : null}
        {grave_reference ? <> · Ref {grave_reference}</> : null}
      </p>

      <p className="mt-3">
        <a href="/" className="text-blue-600 hover:underline">
          ← Back to search
        </a>
      </p>

      {/* Map */}
      <section className="mt-4 rounded-2xl overflow-hidden border border-gray-200 bg-white">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold">Location</h2>
          {hasCoords ? (
            <span className="text-xs text-gray-600">
              lat {lat.toFixed(6)}, lon {lon.toFixed(6)}
            </span>
          ) : (
            <span className="text-xs text-gray-500">No GPS recorded</span>
          )}
        </div>

        <div style={{ height: 360 }}>
          <Map
            mapStyle={MAP_STYLE}
            mapLib={import("maplibre-gl")}
            initialViewState={{
              latitude: hasCoords ? lat : 52.615, // Leicester-ish fallback
              longitude: hasCoords ? lon : -1.123,
              zoom,
            }}
            dragRotate={false}
            touchZoomRotate={true}
            attributionControl={true}
            reuseMaps
            style={{ width: "100%", height: "100%" }}
          >
            <NavigationControl position="top-left" />
            {hasCoords && (
              <Marker latitude={lat} longitude={lon} anchor="bottom">
                <div className="h-5 w-5 -mb-1 rounded-full bg-blue-600 border-2 border-white shadow" />
              </Marker>
            )}
          </Map>
        </div>

        {/* Directions */}
        {hasCoords && (
          <div className="p-3 border-t border-gray-200">
            <DirectionsButtons lat={lat} lon={lon} name={full_name} />
          </div>
        )}
      </section>

      {/* Notes */}
      {notes ? (
        <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="font-semibold mb-1">Notes</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{notes}</p>
        </section>
      ) : null}

      {/* Photos */}
      {photos?.length ? (
        <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="font-semibold mb-2">Photos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((p, i) => (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded overflow-hidden border border-gray-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Photo ${i + 1}`} className="w-full h-40 object-cover" />
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

/* ---------------------------------------------
   Directions buttons (Google, Apple, Waze)
---------------------------------------------- */
function DirectionsButtons({ lat, lon, name }) {
  const label = encodeURIComponent(name || "Grave");
  const dest = `${lat},${lon}`;

  // Deep links
  const links = useMemo(() => {
    // Google Maps
    const gWalk = `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${dest}&travelmode=walking`;
    const gDrive = `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${dest}&travelmode=driving`;

    // Apple Maps (on iOS/macOS this opens the native app)
    // dirflg: w=walk, d=drive
    const aWalk = `https://maps.apple.com/?daddr=${dest}&dirflg=w&q=${label}`;
    const aDrive = `https://maps.apple.com/?daddr=${dest}&dirflg=d&q=${label}`;

    // Waze
    const waze = `https://waze.com/ul?ll=${dest}&navigate=yes`;

    return { gWalk, gDrive, aWalk, aDrive, waze };
  }, [dest, label]);

  async function copyCoords() {
    try {
      await navigator.clipboard.writeText(`${lat}, ${lon}`);
      alert("Coordinates copied.");
    } catch {
      alert("Could not copy coordinates");
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="flex flex-wrap gap-2">
        <a
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-white text-sm hover:bg-blue-700"
          href={links.gWalk}
          target="_blank"
          rel="noopener noreferrer"
        >
          Google • Walk
        </a>
        <a
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-white text-sm hover:bg-blue-700"
          href={links.gDrive}
          target="_blank"
          rel="noopener noreferrer"
        >
          Google • Drive
        </a>
        <a
          className="inline-flex items-center rounded-lg bg-gray-800 px-3 py-2 text-white text-sm hover:bg-black"
          href={links.aWalk}
          target="_blank"
          rel="noopener noreferrer"
        >
          Apple • Walk
        </a>
        <a
          className="inline-flex items-center rounded-lg bg-gray-800 px-3 py-2 text-white text-sm hover:bg-black"
          href={links.aDrive}
          target="_blank"
          rel="noopener noreferrer"
        >
          Apple • Drive
        </a>
        <a
          className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-white text-sm hover:bg-indigo-700"
          href={links.waze}
          target="_blank"
          rel="noopener noreferrer"
        >
          Waze • Navigate
        </a>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={copyCoords}
          className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Copy coordinates
        </button>
        <span className="text-xs text-gray-600">Opens your maps app with turn-by-turn.</span>
      </div>
    </div>
  );
}
