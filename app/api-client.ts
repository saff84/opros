export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function apiJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (response.redirected && new URL(response.url).pathname.includes("signin"))
    throw new ApiError(
      "Сервер отклонил сохранение. Проверьте адрес сайта и восстановите подключение. Ответы остаются в черновике на этом устройстве.",
      401,
    );
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    if (
      response.status === 401 ||
      response.status === 403 ||
      /signin-with-chatgpt|Войдите|sign in|login/i.test(text)
    )
      throw new ApiError(
        "Сервер отклонил сохранение. Проверьте адрес сайта и восстановите подключение. Ответы остаются в черновике на этом устройстве.",
        401,
      );
    throw new ApiError(
      "Сервер временно не смог сохранить ответы. Попробуйте нажать «Далее» ещё раз. Введённые ответы остаются в черновике.",
      response.ok ? 502 : response.status || 502,
    );
  }
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "Сервер вернул неполный ответ. Повторите сохранение; ваши ответы остаются в черновике.",
      502,
    );
  }
  if (!response.ok)
    throw new ApiError(
      data.error || "Не удалось выполнить запрос. Попробуйте ещё раз.",
      response.status,
    );
  return data;
}
