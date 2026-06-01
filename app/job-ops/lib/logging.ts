export function log(stage: string, message: string): void {
  process.stderr.write(`${stage}: ${message}\n`);
}
