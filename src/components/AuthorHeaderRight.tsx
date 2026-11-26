import Image from "next/image";

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
    </div>
  );
}
