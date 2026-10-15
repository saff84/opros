"use client";
import { useState } from "react";
import { apiJson } from "../api-client";
export default function PasswordSettings({ onBack }: { onBack: () => void }) {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (next !== confirm) {
      setError("Новые пароли не совпадают");
      return;
    }
    setBusy(true);
    try {
      await apiJson(
        await fetch("/api/login", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword: current, newPassword: next }),
        }),
      );
      setCurrent("");
      setNext("");
      setConfirm("");
      setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="password-settings">
      <button className="text-button" onClick={onBack}>
        ← К опросам
      </button>
      <form className="summary-card" onSubmit={submit}>
        <span className="eyebrow">БЕЗОПАСНОСТЬ</span>
        <h2>Пароль администратора</h2>
        <p>
          После смены пароля остальные административные сессии завершатся. Этот
          кабинет останется открыт. Ответы и сессии участников сохранятся.
        </p>
        <label className="label">
          Текущий пароль
          <input
            type="password"
            required
            autoComplete="current-password"
            maxLength={256}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="label">
          Новый пароль · минимум 16 символов
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={16}
            maxLength={256}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <label className="label">
          Повторите новый пароль
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={16}
            maxLength={256}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Сохраняем…" : "Сменить пароль"}
        </button>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="notice" role="status">
            Пароль изменён. Все прежние административные сессии отозваны.
          </div>
        )}
      </form>
    </div>
  );
}
