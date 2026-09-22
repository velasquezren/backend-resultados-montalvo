export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
/**
 * Subida con progreso. `fetch` no expone el avance del cuerpo enviado, y un PDF
 * de FileMaker de 7 MB por el internet de la clínica tarda lo suficiente como
 * para que el médico necesite verlo.
 */
export function upload<T>(
  path: string,
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/${path}`);
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(
        new ApiError(
          "No pudimos conectar. Comprueba tu conexión; tus informes guardados siguen disponibles.",
          0,
        ),
      );
    request.onabort = () =>
      reject(new ApiError("La subida se interrumpió.", 0));
    request.onload = () => {
      let data: { error?: { mensaje?: string } } & Record<string, unknown>;
      try {
        data = JSON.parse(request.responseText);
      } catch {
        reject(
          new ApiError(
            "No pudimos leer la respuesta del servidor.",
            request.status,
          ),
        );
        return;
      }
      if (request.status >= 200 && request.status < 300) resolve(data as T);
      else
        reject(
          new ApiError(
            data.error?.mensaje ||
              "No pudimos completar la operación. Intenta nuevamente.",
            request.status,
          ),
        );
    };
    request.send(form);
  });
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
