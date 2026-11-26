"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";

interface AppQrCodeProps {
  url?: string;
  size?: number;
}

export function AppQrCode({ url = "https://aimed-pico.vercel.app", size = 130 }: AppQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    const resolvedUrl =
      typeof window !== "undefined" && window.location.origin && !window.location.origin.includes("localhost")
        ? window.location.origin
        : url;

    void QRCode.toDataURL(resolvedUrl, {
      margin: 1,
      width: size * 2,
      color: {
        dark: "#0f766e",
        light: "#ffffff"
      }
    })
      .then((res) => {
        if (active) setDataUrl(res);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [url, size]);

  const displayUrl =
    typeof window !== "undefined" && window.location.origin && !window.location.origin.includes("localhost")
      ? window.location.origin
      : url;

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 16px",
        background: "#ffffff",
        border: "1px solid #ccfbf1",
        borderRadius: "12px",
        boxShadow: "0 4px 14px rgba(15, 118, 110, 0.08)",
        textAlign: "center"
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          background: "#f0fdfa",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          border: "1px solid #99f6e4",
          position: "relative"
        }}
      >
        {dataUrl ? (
          <Image
            src={dataUrl}
            alt="AIMed QR Code"
            width={size}
            height={size}
            unoptimized
            style={{ display: "block" }}
          />
        ) : (
          <span style={{ fontSize: "var(--fs-badge)", color: "var(--accent)" }}>Generating QR…</span>
        )}
      </div>
      <div style={{ marginTop: "var(--space-2)", fontSize: "var(--fs-badge)", fontWeight: 700, color: "var(--accent)" }}>
        📱 Scan for Mobile Access
      </div>
      <a
        className="tap-link"
        href={displayUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: "var(--fs-badge)",
          color: "var(--muted-2)",
          marginTop: "2px",
          textDecoration: "none",
          fontWeight: 500
        }}
      >
        {displayUrl.replace(/^https?:\/\//, "")}
      </a>
    </div>
  );
}
