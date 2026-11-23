import { ApiError } from "./api";

/** Mirrors the server bound; larger selections are refused before any request. */
export const MAX_DOCUMENT_ORDERS = 500;
export type DocumentKind = "delivery-note" | "packing-slip" | "production-bulk";
export type DocumentLayout = "a4" | "a5" | "a5-two-up";
export type DocumentRequest =
  | { format: "csv" }
  | { format: "pdf" | "zip"; kind: DocumentKind; layout?: DocumentLayout };
/** Server-generated documents are for admins and managers only. */
export const canDownloadDocuments = (role: string) =>
  role === "admin" || role === "manager";

const filename = (res: Response, fallback: string) =>
  /filename="([^"]+)"/.exec(
    res.headers.get("Content-Disposition") ?? "",
  )?.[1] ?? fallback;

async function save(res: Response, fallback: string) {
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiError(
      data?.error ?? "Unable to connect. Try again.",
      res.status,
    );
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename(res, fallback);
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Download only: nothing is sent, printed or changed on the order. */
export async function downloadOrders(ids: string[], request: DocumentRequest) {
  const res = await fetch("/api/orders/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, ...request }),
  });
  await save(res, `3l-orders.${request.format}`);
}
export async function downloadOrderDocument(
  id: string,
  kind: DocumentKind,
  layout: DocumentLayout = "a4",
) {
  const res = await fetch(
    `/api/orders/${encodeURIComponent(id)}/document?kind=${kind}&layout=${layout}`,
  );
  await save(res, `3l-${kind}.pdf`);
}
