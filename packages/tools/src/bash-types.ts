export interface BashInput {
  command: string;
  timeout_ms?: number | undefined;
  background?: boolean | undefined;
  hermetic?: boolean | undefined;
}

export interface BashOutput {
  output: string;
  exit_code: number | null;
  timed_out: boolean;
  pid?: number | null | undefined;
  /** Background run: the file its stdout and stderr go to. */
  log_file?: string | undefined;
  error?: string | undefined;
}
