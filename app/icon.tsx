import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b09",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#e8b64c",
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          CL
        </div>
      </div>
    ),
    { ...size },
  );
}
