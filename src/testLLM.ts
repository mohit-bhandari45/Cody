import "dotenv/config";
import { reviewDiff } from "./llm/client";

const sampleDiff = `
File: src/utils/math.ts
@@ -1,3 +1,10 @@
-export function divide(a: number, b: number): number {
-  return a / b;
-}
+export function divide(a: number, b: number): number {
+  return a / b;
+}
+
+export function getDiscountedPrice(price: number, discountPercent: number): number {
+  const discount = price * discountPercent / 100;
+  return price - discount;
+}
+
+export function getUserAge(birthYear: number): number {
+  const currentYear = 2026;
+  return currentYear - birthYear;
+}
`;

reviewDiff(sampleDiff).then((result) => {
  console.log("Summary:", result.summary);
  console.log("Issues:", result.issues);
});