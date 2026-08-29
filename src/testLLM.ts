import "dotenv/config";
import { reviewDiff } from "./llm/client";

const sampleDiff = `
File: src/utils.js
@@ -5,3 +5,6 @@
 function existing() {
   return 1;
 }
+function divide(a, b) {
+  return a / b;
+}
`;

reviewDiff(sampleDiff).then((result) => {
  console.log("Summary:", result.summary);
  console.log("Issues:", JSON.stringify(result.issues, null, 2));
});