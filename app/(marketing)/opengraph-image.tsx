import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Overrides the app-wide app/opengraph-image.tsx for this route group (the
// landing page and /sign-in) — the app-wide card is a generic wordmark card,
// this one echoes the landing page's own hero copy (low-ticket sweep,
// V4 spec Phase 3).
export default function MarketingOpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          background: "#0b0b09",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            borderRadius: 14,
            border: "2px solid #e8b64c",
            color: "#e8b64c",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: -1,
            marginBottom: 40,
          }}
        >
          CL
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            color: "#f4f2ed",
            fontSize: 60,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.15,
          }}
        >
          <span>Every job costed.</span>
          <span>
            Every entry auditable, <span style={{ color: "#e8b64c" }}>forever.</span>
          </span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            color: "#a8a29a",
            fontSize: 26,
            fontWeight: 400,
          }}
        >
          Job-centric accounting for builders, computed from a double-entry ledger.
        </div>
      </div>
    ),
    { ...size },
  );
}
