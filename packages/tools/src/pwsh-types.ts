export interface PwshInput {
  command: string;
  workdir?: string | undefined;
  timeout_ms?: number | undefined;
  run_in_background?: boolean | undefined;
  background?: boolean | undefined;
}

export interface PwshOutput {
  output: string;
  exit_code: number | null;
  timed_out: boolean;
  pid?: number | null | undefined;
  job_id?: string | undefined;
  /** Background run: the file its stdout and stderr go to. */
  log_file?: string | undefined;
  error?: string | undefined;
}
