export function resolveInstallationId(payload: any): number | undefined {
    const installationId = payload?.installation?.id;
    if (Number.isInteger(installationId) && installationId > 0) {
        return Number(installationId);
    }

    return undefined;
}