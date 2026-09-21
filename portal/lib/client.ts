export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers:
        body instanceof FormData
          ? undefined
          : { "Content-Type": "application/json" },
      body:
        body instanceof FormData
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "No pudimos conectar. Comprueba tu conexión; tus informes guardados siguen disponibles.",
      0,
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error?.mensaje ||
        "No pudimos completar la operación. Intenta nuevamente.",
      response.status,
    );
  return data as T;
}
