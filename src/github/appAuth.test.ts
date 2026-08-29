import test from "node:test";
import assert from "node:assert/strict";
import { normalizePrivateKey } from "./helper";


test("normalizePrivateKey converts escaped newlines into real PEM newlines", () => {
  const input = "-----BEGIN RSA PRIVATE KEY-----\\nabc123\\n-----END RSA PRIVATE KEY-----";

  assert.equal(
    normalizePrivateKey(input),
    "-----BEGIN RSA PRIVATE KEY-----\nabc123\n-----END RSA PRIVATE KEY-----",
  );
});

test("normalizePrivateKey trims whitespace while preserving PEM formatting", () => {
  const input = "  -----BEGIN RSA PRIVATE KEY-----\\nMIIE\\n-----END RSA PRIVATE KEY-----  ";

  assert.equal(
    normalizePrivateKey(input),
    "-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----",
  );
});
