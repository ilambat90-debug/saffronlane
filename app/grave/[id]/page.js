// app/grave/[id]/page.js   ← SERVER component (do NOT add "use client")
import GraveClient from "./GraveClient";

export default function Page({ params }) {
  // Safe to read params on the server
  return <GraveClient id={params.id} />;
}
