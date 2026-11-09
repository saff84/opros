"use client";
import { useEffect, useState } from "react";
import { apiJson } from "../api-client";
type User = { id: string; username: string; role: string; active: number; surveyIds: string[] };
type BackupStatus = {
  settings: { enabled: boolean; everyHours: number; retentionDays: number };
  files: { name: string; size: number; created: string }[];
  lastSuccess: { name: string; created: string } | null;
  lastError: string | null;
};
export default function SystemSettings({ onBack }: { onBack: () => void }) {
  const [surveys, setSurveys] = useState<{ id: string; title: string }[]>([]);
  const [pageTitle, setPageTitle] = useState("");
  const [pageDescription, setPageDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [surveyIds, setSurveyIds] = useState<string[]>([]);
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
      "admin",
    );
  }
  async function load() {
    setLoading(true);
    setLoadErrors({});
    try {
      const paths = ["Пользователи", "Резервные копии", "Главная страница"];
      const loaded = await Promise.allSettled([
        request("/api/team").then((team) => { setUsers(team.users); setSurveys(team.surveys); }),
        request("/api/backups").then((copies) => setBackup(copies)),
        request("/api/site-settings").then((settings) => { setPageTitle(settings.pageTitle); setPageDescription(settings.pageDescription); }),
      ]);
      setLoadErrors(Object.fromEntries(loaded.flatMap((result, index) => result.status === "rejected" ? [[paths[index], result.reason instanceof Error ? result.reason.message : "Не удалось загрузить раздел"]] : [])));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
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
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function createUser() {
    const login = username.trim();
    setError("");
    setNotice("");
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(login)) {
      setError("Логин: 3–40 символов. Используйте латинские буквы, цифры и символы . _ -");
      return;
    }
    if (login.toLowerCase() === "admin") {
      setError("Логин admin занят владельцем. Для нового администратора укажите другой логин.");
      return;
    }
    if (password.length < 16 || password.length > 256) {
      setError(`Пароль должен содержать от 16 до 256 символов. Сейчас: ${password.length}.`);
      return;
    }
    if (await action("/api/team", { username: login, password, role, surveyIds: role === "admin" ? [] : surveyIds }, "Пользователь создан")) {
      setUsername(""); setPassword(""); setSurveyIds([]);
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
      {loading && <p role="status">Загружаем настройки…</p>}
      <fieldset disabled={busy || loading}>
        <section className="summary-card">
          <h3>Главная страница</h3>
          {loadErrors["Главная страница"] && <p className="error" role="alert">Главная страница: {loadErrors["Главная страница"]}</p>}
          <label className="label">Title страницы · заголовок вкладки браузера
            <input maxLength={160} value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} />
          </label>
          <p className="small">Используется на странице выбора опроса. Пустое поле вернёт стандартный заголовок.</p>
          <label className="label">Meta description · описание главной страницы
            <textarea maxLength={1000} rows={3} value={pageDescription} onChange={(e) => setPageDescription(e.target.value)} />
            <span className="small">Описание в HTML для поисковиков. Пустое поле вернёт стандартное описание.</span>
          </label>
          <button onClick={() => void action("/api/site-settings", { pageTitle, pageDescription }, "Заголовок и описание главной страницы сохранены")}>Сохранить title и описание</button>
        </section>
        <section className="summary-card">
          <h3>Пользователи кабинета</h3>
          {loadErrors["Пользователи"] && <p className="error" role="alert">Пользователи: {loadErrors["Пользователи"]}</p>}
          <p className="small">
            Владелец входит как admin по существующему паролю. Администратор
            управляет доступом и копиями, редактор — опросами, наблюдатель
            только читает отчёты назначенных опросов. Владелец и администраторы имеют доступ ко всем опросам. Редактор автоматически получает доступ к созданным им опросам. При изменении прав действующие сессии
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
                  <th>Доступные опросы</th>
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
                              ).then((saved) => {
                                if (saved) {
                                  setResetPassword("");
                                  setResetUser("");
                                }
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
                    <td>
                      {user.role === "admin" ? "Все опросы" : (
                        <div>
                          {surveys.map((survey) => (
                            <label className="checkbox-label" key={survey.id}>
                              <input type="checkbox" checked={user.surveyIds.includes(survey.id)}
                                onChange={(e) => setUsers(users.map((item) => item.id === user.id ? { ...item, surveyIds: e.target.checked ? [...item.surveyIds, survey.id] : item.surveyIds.filter((id) => id !== survey.id) } : item))} />
                              {survey.title}
                            </label>
                          ))}
                          <button onClick={() => void action("/api/team", { ...user, active: !!user.active }, "Доступ к опросам сохранён")}>Сохранить доступ</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>Добавить пользователя</h4>
          {role !== "admin" && <fieldset><legend>Доступные опросы</legend>
            {surveys.map((survey) => <label className="checkbox-label" key={survey.id}>
              <input type="checkbox" checked={surveyIds.includes(survey.id)} onChange={(e) => setSurveyIds(e.target.checked ? [...surveyIds, survey.id] : surveyIds.filter((id) => id !== survey.id))} />{survey.title}
            </label>)}
            <p className="small">Без назначений пользователь не видит существующие опросы.</p>
          </fieldset>}
          <div className="form-grid">
            <label className="label">
              Логин · 3–40 символов: латинские буквы, цифры, . _ -
              <input
                value={username}
                maxLength={40}
                minLength={3}
                autoComplete="off"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="label">
              Пароль · от 16 символов
              <input
                type="password"
                value={password}
                aria-describedby="new-user-password-hint"
                minLength={16}
                maxLength={256}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
              />
              <span id="new-user-password-hint" className="small">Введено: {password.length} из минимум 16 символов.{password.length > 0 && password.length < 16 ? ` Добавьте ещё ${16 - password.length}.` : ""}</span>
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
          <p className="small">Логин admin занят владельцем. Создавать и менять пользователей может администратор.</p>
          <button
            className="primary"
            onClick={() => void createUser()}
          >
            Создать пользователя
          </button>
        </section>
        {loadErrors["Резервные копии"] && <section className="summary-card">
          <h3>Резервные копии</h3>
          <p className="error" role="alert">Резервные копии: {loadErrors["Резервные копии"]}</p>
          <p className="small">Эта ошибка не блокирует создание пользователей и изменение настроек главной страницы.</p>
          <button onClick={() => void load()}>Повторить загрузку настроек</button>
        </section>}
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
