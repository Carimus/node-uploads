export class InvalidConfigError extends Error {
    public constructor(missing: string[] = []) {
        super(
            missing.length === 0
                ? 'Invalid configuration provided.'
                : `Missing required configuration: ${missing.join(', ')}`,
        );
    }
}
