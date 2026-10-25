/** Reads only the existing session capability. Never infer ownership from a URL or order number. */
export function checkoutCapability(
  storage: Pick<Storage, "getItem">,
): string | null {
  try {
    const saved: unknown = JSON.parse(storage.getItem("3l-checkout") ?? "null");
    const key =
      saved && typeof saved === "object" && "key" in saved ? saved.key : null;
    return typeof key === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        key,
      )
      ? key
      : null;
  } catch {
    return null;
  }
}
