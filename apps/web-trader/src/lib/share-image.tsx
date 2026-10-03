import { ImageResponse } from "next/og";

export function renderShareImage({
  title,
  category,
  subtitle,
}: {
  title: string;
  category: string;
  subtitle: string;
}) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#f5f8fe",
        padding: "55px 64px",
        color: "#182338",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "13px",
            fontSize: 36,
            fontWeight: 700,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40">
            <rect width="40" height="40" rx="11" fill="#2859c5" />
            <path d="M20 10L31 29H9Z" fill="white" />
          </svg>
          azuriya<span style={{ color: "#2859c5" }}>.</span>
        </div>
        <div style={{ display: "flex", color: "#526c91", fontSize: 16 }}>
          THE AZURIYA JOURNAL
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: "46px",
          background: "white",
          padding: "36px 42px",
          border: "1px solid #d8e2f0",
          borderRadius: 14,
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 16,
            color: "#2859c5",
            textTransform: "uppercase",
            letterSpacing: "2px",
            marginBottom: 20,
          }}
        >
          {category}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 75 ? 43 : 49,
            fontWeight: 700,
            lineHeight: 1.16,
            letterSpacing: "-1.5px",
            maxWidth: 960,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 21,
            color: "#62758f",
            marginTop: 24,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "#60748f",
          fontSize: 15,
          marginTop: 25,
        }}
      >
        <span>Brokerage · Prop firms · Trading communities</span>
        <span>Practical guides for operators</span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
