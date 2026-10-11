/** Future contract only: no transport, fake service, endpoint, or job storage. */
export type PrinterDestination = "kitchen" | "reception";
export type PrinterHealth = "unconfigured" | "offline" | "online";
export interface PrinterRegistration {
  id: string;
  destination: PrinterDestination;
  model: string;
  health: PrinterHealth;
  lastSeenAt?: string;
}
export interface PrintJob {
  id: string;
  orderId: string;
  orderVersion: number;
  destination: PrinterDestination;
  status: "pending" | "printing" | "failed" | "printed";
  attempts: number;
  requestedBy: string;
  reprintOf?: string;
  completedAt?: string;
}
export const PRINTER_TARGETS = [
  { destination: "kitchen", model: "Epson TM-T20II M267E" },
  { destination: "reception", model: "Epson TM-T20II M267D" },
] as const;
