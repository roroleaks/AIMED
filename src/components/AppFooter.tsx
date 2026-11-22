import { getFooterText } from "@/lib/version";

interface AppFooterProps {
  stepText?: string;
}

export function AppFooter({ stepText }: AppFooterProps) {
  return (
    <footer>
      <div>
        {getFooterText()} {stepText ? `· ${stepText}` : "· Educational & Research Decision Support: always verify formulated questions clinically."}
      </div>
      <div style={{ marginTop: "6px", fontSize: "0.82rem" }}>
        Copyright{" "}
        <a
          href="https://doi.org/10.5281/zenodo.24402747"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          doi.org/10.5281/zenodo.24402747
        </a>
      </div>
    </footer>
  );
}
