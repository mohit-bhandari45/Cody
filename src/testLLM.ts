import "dotenv/config";
import { reviewDiff } from "./llm/client";

const sampleDiff = `
@@ -1 +1,5 @@
-// Main file
+// test change
+// test change
+// test change
+// test change
+// test change
`;

reviewDiff(sampleDiff).then((result) => {
  console.log("LLM Review:\n", result);
});