export function stringArrayToText(value: string[]): string {
  return value.join('\n');
}

export function textToStringArray(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
