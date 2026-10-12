import { z } from "zod";
// A missing address is different from an unverified, complete manual address.
const identifiable = (value: string) => /[\p{L}\p{N}]/u.test(value);
export const deliveryStreet = z
  .string()
  .trim()
  .min(5)
  .max(300)
  .refine(identifiable, "Enter a street address");
export const deliveryBuilding = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(identifiable, "Enter a building or villa");
