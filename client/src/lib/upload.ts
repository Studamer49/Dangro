import api, { apiErrorCode, apiErrorMessage } from "./api";

/**
 * The one place the browser talks to `POST /api/uploads`.
 *
 * Every uploader in the app — profile picture, post, story, DM attachment,
 * voice note — goes through here, so the request shape cannot drift between
 * them. The backend validates the MIME type against the file's magic bytes and
 * applies the size limits; the browser only decides what to send.
 */

export interface UploadResult {
  /**
   * Where the bytes actually live. For an image this is a Cloudinary
   * `https://res.cloudinary.com/...` delivery URL; for anything else it is a
   * root-relative `/uploads/<uuid>.<ext>`. Both are safe in an `src`.
   */
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  type: "image" | "video" | "audio" | "file";
  /** Cloudinary's asset ID, for later deletion. Null for the other backends. */
  publicId: string | null;
  width: number | null;
  height: number | null;
}

export interface UploadOptions {
  /** 0-100. Only fires when the browser can measure the request. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Uploads one file and returns the stored URL.
 *
 * No `Content-Type` header is set, and that is deliberate. A multipart body
 * needs a `boundary` parameter that only the serialiser knows, so the header
 * must be left for the browser to generate; setting
 * `multipart/form-data` by hand sends no boundary and the server parses an
 * empty body. Axios currently deletes the header for `FormData` in the browser
 * adapter, so the bug would stay hidden until that changed — a boundary-less
 * upload fails as "no file uploaded", which looks like a server fault.
 */
export async function uploadMedia(
  file: Blob,
  filename?: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const form = new FormData();
  // The field name is Multer's `upload.single("file")` on the server.
  form.append("file", file, filename);

  const { data } = await api.post<UploadResult>("/uploads", form, {
    signal: options.signal,
    onUploadProgress: options.onProgress
      ? (event) => {
          if (event.total) {
            options.onProgress?.(Math.round((event.loaded / event.total) * 100));
          }
        }
      : undefined,
  });

  return data;
}

/**
 * A failed upload, described in terms the person uploading can act on.
 *
 * The API already names what went wrong; what it cannot say is whether the
 * fault is theirs or the deployment's. Those two used to raise the same
 * generic toast, which is how an unconfigured image store looked like an
 * application bug rather than a deployment one.
 */
export function uploadErrorMessage(error: unknown, fallback = "Upload failed"): string {
  const detail = apiErrorMessage(error, fallback);

  switch (apiErrorCode(error)) {
    case "SERVICE_UNAVAILABLE":
      return "This server cannot store images right now. Nothing was uploaded — please try again later.";
    case "UPSTREAM_ERROR":
      return `The image store rejected this file. ${detail}`;
    case "RATE_LIMITED":
      return "Too many uploads in a row. Wait a moment and try again.";
    case "PAYLOAD_TOO_LARGE":
    case "BAD_REQUEST":
    case "VALIDATION_ERROR":
      // Already specific about which limit or which field.
      return detail;
    default:
      // A transport failure: no response, so the API said nothing useful.
      return detail === fallback ? `${fallback} — check your connection and try again.` : detail;
  }
}