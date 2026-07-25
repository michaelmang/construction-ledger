import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
            width: 72,
            height: 72,
            borderRadius: 16,
            border: "2px solid #e8b64c",
            color: "#e8b64c",
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: -1,
            marginBottom: 48,
          }}
        >
          CL
        </div>
        <div
          style={{
            display: "flex",
            color: "#f4f2ed",
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.1,
          }}
        >
          Construction Ledger
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            color: "#a8a29a",
            fontSize: 30,
            fontWeight: 400,
          }}
        >
          Job-costed accounting for construction, built on hledger.
        </div>
      </div>
    ),
    { ...size },
  );
}
