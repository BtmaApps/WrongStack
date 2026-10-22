export interface DockerCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type DockerCommandRunner = (
  args: string[],
  options: {
    signal?: AbortSignal | undefined;
    timeoutMs: number;
    onOutput?: ((text: string) => void) | undefined;
    env?: Readonly<Record<string, string>> | undefined;
  },
) => Promise<DockerCommandResult>;
