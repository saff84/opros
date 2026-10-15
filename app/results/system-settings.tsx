"use client";
import { useEffect, useState } from "react";
import { apiJson } from "../api-client";
type User = { id: string; username: string; role: string; active: number };
type BackupStatus = {
  settings: { enabled: boolean; everyHours: number; retentionDays: number };
  files: { name: string; size: number; created: string }[];
  lastSuccess: { name: string; created: string } | null;
  lastError: string | null;
};
export default function SystemSettings({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<User[]>([]),
    [backup, setBackup] = useState<BackupStatus | null>(null),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [resetUser, setResetUser] = useState(""),
    [resetPassword, setResetPassword] = useState(""),
    [role, setRole] = useState("viewer"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function request(path: string, body?: unknown) {
    return apiJson(
      await fetch(
        path,
        body === undefined
          ? { cache: "no-store" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
      ),
    );
  }
  async function load() {
    try {
      const [team, copies] = await Promise.all([
        request("/api/team"),
        request("/api/backups"),
      ]);
      setUsers(team.users);
      setBackup(copies);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(path: string, body: unknown, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(path, body);
      setNotice(message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button className="text-button" onClick={onBack}>
        ← К опросам
      </button>
      <h1>Доступ и резервные копии</h1>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <fieldset disabled={busy}>
        <section className="summary-card">
          <h3>Пользователи кабинета</h3>
          <p className="small">
            Владелец входит как admin по существующему паролю. Администратор
            управляет доступом и копиями, редактор — опросами, наблюдатель
            только читает отчёты. При изменении прав действующие сессии
            пользователя закрываются.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Логин</th>
                  <th>Роль</th>
                  <th>Доступ</th>
                  <th>Пароль</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>
                      <select
                        aria-label={"Роль " + user.username}
                        value={user.role}
                        onChange={(e) =>
                          void action(
                            "/api/team",
                            {
                              ...user,
                              active: !!user.active,
                              role: e.target.value,
                            },
                            "Права обновлены",
                          )
                        }
                      >
                        <option value="admin">Администратор</option>
                        <option value="editor">Редактор</option>
                        <option value="viewer">Просмотр</option>
                      </select>
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          void action(
                            "/api/team",
                            { ...user, active: !user.active },
                            "Доступ обновлён",
                          )
                        }
                      >
                        {user.active ? "Отключить" : "Включить"}
                      </button>
                    </td>
                    <td>
                      {resetUser === user.id ? (
                        <div>
                          <input
                            aria-label={"Новый пароль " + user.username}
                            type="password"
                            autoComplete="new-password"
                            minLength={16}
                            maxLength={256}
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                          />
                          <button
                            disabled={resetPassword.length < 16}
                            onClick={() =>
                              void action(
                                "/api/team",
                                {
                                  ...user,
                                  active: !!user.active,
                                  password: resetPassword,
                                },
                                "Пароль обновлён",
                              ).then(() => {
                                setResetPassword("");
                                setResetUser("");
                              })
                            }
                          >
                            Сохранить пароль
                          </button>
                          <button
                            onClick={() => {
                              setResetUser("");
                              setResetPassword("");
                            }}
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setResetUser(user.id);
                            setResetPassword("");
                          }}
                        >
                          Задать новый
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>Добавить пользователя</h4>
          <div className="form-grid">
            <label className="label">
              Логин
              <input
                value={username}
                maxLength={40}
                autoComplete="off"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="label">
              Пароль · от 16 символов
              <input
                type="password"
                value={password}
                minLength={16}
                maxLength={256}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="label">
              Роль
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="viewer">Просмотр</option>
                <option value="editor">Редактор</option>
                <option value="admin">Администратор</option>
              </select>
            </label>
          </div>
          <button
            className="primary"
            disabled={!username || password.length < 16}
            onClick={() =>
              void action(
                "/api/team",
                { username, password, role },
                "Пользователь создан",
              ).then(() => setPassword(""))
            }
          >
            Создать пользователя
          </button>
        </section>
        {backup && (
          <section className="summary-card">
            <h3>Автоматические резервные копии</h3>
            <p className="small">
              В Docker работает отдельный сервис backup. Копии включают все
              опросы, ответы, картинки, настройки и пользователей. Они хранятся
              в томе приложения; скачивайте копии отдельно для защиты от потери
              диска.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={backup.settings.enabled}
                onChange={(e) =>
                  setBackup({
                    ...backup,
                    settings: { ...backup.settings, enabled: e.target.checked },
                  })
                }
              />
              Создавать по расписанию
            </label>
            <div className="form-grid">
              <label className="label">
                Интервал, часов
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={backup.settings.everyHours}
                  onChange={(e) =>
                    setBackup({
                      ...backup,
                      settings: {
                        ...backup.settings,
                        everyHours: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="label">
                Хранить, дней
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={backup.settings.retentionDays}
                  onChange={(e) =>
                    setBackup({
                      ...backup,
                      settings: {
                        ...backup.settings,
                        retentionDays: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="actions">
              <button
                onClick={() =>
                  void action(
                    "/api/backups",
                    backup.settings,
                    "Расписание сохранено",
                  )
                }
              >
                Сохранить расписание
              </button>
              <button
                className="primary"
                onClick={() =>
                  void action(
                    "/api/backups",
                    { action: "run" },
                    "Резервная копия создана",
                  )
                }
              >
                Создать копию сейчас
              </button>
            </div>
            <p>
              Последняя успешная:{" "}
              {backup.lastSuccess
                ? new Date(backup.lastSuccess.created).toLocaleString("ru-RU")
                : "ещё не создана"}
              .
            </p>
            {backup.lastError && (
              <div className="error">Последняя ошибка: {backup.lastError}</div>
            )}
            <ul>
              {backup.files.map((file) => (
                <li key={file.name}>
                  <a
                    href={"/api/backups?file=" + encodeURIComponent(file.name)}
                  >
                    {new Date(file.created).toLocaleString("ru-RU")} ·{" "}
                    {(file.size / 1024).toFixed(0)} КБ · Скачать
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </fieldset>
    </div>
  );
}
