import { CSSProperties } from "react";
import type { Survey, Welcome } from "./survey-model";
import { welcomeDefaults } from "../scripts/welcome.mjs";
export function WelcomeBlock({ survey }: { survey: Survey }) {
  const w = { ...welcomeDefaults, ...survey.welcome } as Required<Welcome>;
  const gallery = w.images.length > 0 && (
    <div className="welcome-gallery">
      {w.images.map((image, i) => (
        <figure key={image.src + i}>
          <img
            src={image.src}
            alt={image.alt}
            style={{ objectFit: w.imageFit }}
          />
          {image.alt && <figcaption>{image.alt}</figcaption>}
        </figure>
      ))}
    </div>
  );
  return (
    <aside
      className={`welcome-block ${w.showStripe ? "" : "welcome-no-stripe"}`}
      style={
        {
          "--cyan": survey.accent,
          textAlign: w.align,
          color: w.textColor,
          background: survey.background,
          "--welcome-title-size": `${w.titleSize}px`,
        } as CSSProperties
      }
    >
      {w.imagePosition === "top" && gallery}
      {w.eyebrow && <div className="eyebrow">{w.eyebrow}</div>}
      <h1 className="pre">{w.heading ?? survey.title}</h1>
      <p className="pre">{w.description ?? survey.description}</p>
      {w.imagePosition === "bottom" && gallery}
      {w.showFooter && (
        <div className="aside-bottom">
          <span className="big">{w.symbol}</span>
          <span className="pre">{w.footer}</span>
        </div>
      )}
    </aside>
  );
}
