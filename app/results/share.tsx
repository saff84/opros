"use client";
import { useEffect, useState } from "react";
import type { Survey } from "../survey-model";
import { download } from "../exports";
export default function Share({ survey }: { survey: Survey }) {
  const [source, setSource] = useState(""),
    [campaign, setCampaign] = useState(""),
    [origin, setOrigin] = useState(""),
    [qr, setQr] = useState(""),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    setOrigin(location.origin);
  }, []);
  const params = new URLSearchParams({ survey: survey.id });
  if (source.trim()) params.set("source", source.trim());
  if (campaign.trim()) params.set("campaign", campaign.trim());
  const url = origin + "/?" + params.toString();
  useEffect(() => {
    let active = true;
    setQr("");
    setCopied(false);
    if (origin)
      import("qrcode")
        .then((q) =>
          q.toDataURL(url, {
            width: 360,
            margin: 4,
            errorCorrectionLevel: "M",
          }),
        )
        .then((data) => {
          if (active) setQr(data);
        })
        .catch(() => {
          if (active)
            setError("Не удалось сформировать QR-код. Сократите метки.");
        });
    return () => {
      active = false;
    };
  }, [url, origin]);
  return (
    <details className="summary-card share-panel no-print">
      <summary>Ссылка с меткой и QR-код</summary>
      <p className="small">
        Для каждой рассылки или мероприятия задайте свой источник. Метки
        запоминаются при первом открытии анкеты на устройстве.
      </p>
      <div className="share-grid">
        <div>
          <div className="form-grid">
            <label className="label">
              Источник
              <input
                maxLength={120}
                placeholder="email, выставка, отдел-продаж"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setError("");
                }}
              />
            </label>
            <label className="label">
              Кампания
              <input
                maxLength={160}
                placeholder="Осень-2026"
                value={campaign}
                onChange={(e) => {
                  setCampaign(e.target.value);
                  setError("");
                }}
              />
            </label>
          </div>
          <label className="label">
            Ссылка для участников
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>
          <div className="actions">
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(url)
                  .then(() => setCopied(true))
                  .catch(() => setError("Скопируйте ссылку из поля вручную."))
              }
            >
              {copied ? "Скопировано ✓" : "Скопировать ссылку"}
            </button>
            <button
              disabled={!qr}
              onClick={() => {
                const a = document.createElement("a");
                a.href = qr;
                a.download = "survey-qr.png";
                a.click();
              }}
            >
              Скачать PNG
            </button>
            <button
              disabled={!qr}
              onClick={() =>
                void import("qrcode")
                  .then((q) => q.toString(url, { type: "svg", margin: 4 }))
                  .then((svg) =>
                    download(svg, "image/svg+xml", "survey-qr.svg"),
                  )
                  .catch(() => setError("Ошибка создания SVG"))
              }
            >
              Скачать SVG
            </button>
          </div>
        </div>
        {qr && (
          <img src={qr} className="qr-preview" alt="QR-код ссылки на опрос" />
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </details>
  );
}
