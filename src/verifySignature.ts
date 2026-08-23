import crypto from "crypto";

export function verifyGithubSignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    secret: string
): boolean {
    if(!signatureHeader) return false;

    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const sigBuffer = Buffer.from(signatureHeader);
    const expectedBuffer = Buffer.from(expected);

    if(sigBuffer.length != expectedBuffer.length) return false;

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}