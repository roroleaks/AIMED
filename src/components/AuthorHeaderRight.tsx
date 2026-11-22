import Image from "next/image";
import { APP_VERSION, getCommitSha } from "@/lib/version";

export function AuthorHeaderRight() {
  return (
    <div className="hdr-right" style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
      <span className="author-name">
        <Image
          src="/dr-raouf.jpg"
          alt="Dr Raouf Roshdy"
          className="author-photo"
          width={72}
          height={72}
          priority
        />
        Dr Raouf Roshdy
      </span>
      <span className="version-tag" style={{ fontSize: "0.82rem", color: "rgba(255, 255, 255, 0.75)", fontWeight: 600 }}>
        v{APP_VERSION} ({getCommitSha()})
      </span>
    </div>
  );
}
