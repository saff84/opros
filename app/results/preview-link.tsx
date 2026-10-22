"use client";
import { useState } from "react";
import { apiJson } from "../api-client";
export default function PreviewLink({ surveyId }: { surveyId: string }) {
  const [url, setUrl] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function change(revoke = false) {
    setBusy(true); setMessage("");
    try {
      const result = await apiJson(await fetch("/api/preview", {
        method: revoke ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ surveyId }),
      }));
      setUrl(revoke ? "" : location.origin + result.path);
      setMessage(revoke ? "Ссылка отключена." : "Ссылка действует 7 дней. Предыдущая ссылка отключена.");
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="summary-card no-print">
    <h3>Ссылка на предпросмотр</h3>
    <p className="small">Доступна без входа в кабинет, даже если опрос не опубликован. Показывает последние сохранённые изменения. Ответы не попадают в статистику.</p>
    <div className="actions">
      <button disabled={busy} onClick={() => void change()}>{url ? "Создать новую ссылку" : "Создать ссылку на 7 дней"}</button>
      <button disabled={busy} onClick={() => void change(true)}>Отключить ссылку</button>
    </div>
    {url && <><label className="label">Ссылка для проверки<input readOnly value={url} onFocus={e => e.target.select()} /></label>
      <div className="actions"><a href={url} target="_blank" rel="noopener noreferrer">Открыть предпросмотр ↗</a>
        <button onClick={() => void navigator.clipboard.writeText(url).then(() => setMessage("Ссылка скопирована.")).catch(() => setMessage("Скопируйте ссылку из поля вручную."))}>Скопировать</button></div></>}
    {message && <p role="status">{message}</p>}
  </div>;
}
