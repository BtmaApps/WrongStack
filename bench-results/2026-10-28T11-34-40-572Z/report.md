# WrongStack benchmark — polyglot

**Harness:** wrongstack@1.2.2 · fp:39ba3372c6ed · maxIter=40 · yolo · profile=lean
**Finished:** 2026-10-28T17:05:02.980Z
**Tasks/cell:** 199
**Attempts/task:** 3 (pass@1 is measured over every attempt)

Grading is deterministic (the suite's own tests decide pass/fail — no LLM judge). The only variable across rows is the model; everything else is fixed by the harness fingerprint.

| Model | Pass@1 | Pass@3 | All-pass | Flaky tasks | Edit-apply | $/task | tok/task | tok/solve | iters (p50) | wall (p50) | timeout | 429s | subagents |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| glm-5.3-flash | 98.2% | 100.0% | 96.0% | 8/199 | 99.5% | $0.000 | 118.2k | 120.5k | 8 | 60.5s | 1.3% | 0 | 0 |

_Pass@1 is the share of all 3 attempts that passed; Pass@3 is the share of tasks solved at least once; All-pass is the share solved every time. Flaky tasks split their own attempts — a large flaky count means the gap between two models may be noise.

_tok/task is every token an attempt moved — full prompt including cache reads plus output, leader and subagents/companions together. tok/solve is all tokens spent divided by passing attempts: the price of one solved task, failures included. Lower is better._

_Subagents is a cell-wide TOTAL of delegation starts (`delegate_started` events plus `spawn_subagent` tool calls) summed over every task and attempt — not a per-task average._

> ⚠ 8 attempt(s) timed out or crashed before reporting usage. Their cost is counted as zero, so $/task is a lower bound (token columns come from the session log and still count them).

_Fingerprint hash: `39ba3372c6ed` · tools: 30 · subset: `polyglot:e7baae2d1d51`_

## Cost vs quality

| Model | Pass@1 | $/task | Pass per $ | tok/solve |
|---|---:|---:|---:|---:|
| glm-5.3-flash | 98.2% | $0.000 | — | 120.5k |

_Pass per $ is Pass@1 / average USD per task. Higher is better. Zero-cost rows show —._

## Per-task matrix

| Task | glm-5.3-flash |
|---|---|
| polyglot/python/beer-song | PASS |
| polyglot/python/affine-cipher | PASS |
| polyglot/python/book-store | PASS |
| polyglot/python/bottle-song | PASS |
| polyglot/python/bowling | PASS |
| polyglot/python/connect | PASS |
| polyglot/python/dominoes | PASS |
| polyglot/python/dot-dsl | PASS |
| polyglot/python/food-chain | PASS |
| polyglot/python/forth | PASS |
| polyglot/python/go-counting | PASS |
| polyglot/python/grade-school | PASS |
| polyglot/python/grep | PASS |
| polyglot/python/hangman | PASS |
| polyglot/python/list-ops | PASS |
| polyglot/python/paasio | PASS |
| polyglot/python/phone-number | PASS |
| polyglot/python/pig-latin | PASS |
| polyglot/python/poker | PASS |
| polyglot/python/pov | PASS |
| polyglot/python/proverb | PASS |
| polyglot/python/react | PASS |
| polyglot/python/rest-api | PASS |
| polyglot/python/robot-name | PASS |
| polyglot/python/scale-generator | PASS |
| polyglot/python/sgf-parsing | PASS |
| polyglot/python/simple-linked-list | PASS |
| polyglot/python/transpose | PASS |
| polyglot/python/tree-building | PASS |
| polyglot/python/two-bucket | PASS |
| polyglot/python/variable-length-quantity | PASS |
| polyglot/python/wordy | PASS |
| polyglot/python/zebra-puzzle | PASS |
| polyglot/python/zipper | PASS |
| polyglot/javascript/affine-cipher | PASS |
| polyglot/javascript/alphametics | PASS |
| polyglot/javascript/beer-song | PASS |
| polyglot/javascript/binary | PASS |
| polyglot/javascript/book-store | PASS |
| polyglot/javascript/bottle-song | PASS |
| polyglot/javascript/bowling | PASS |
| polyglot/javascript/complex-numbers | PASS |
| polyglot/javascript/connect | PASS |
| polyglot/javascript/food-chain | PASS |
| polyglot/javascript/forth | PASS |
| polyglot/javascript/go-counting | PASS |
| polyglot/javascript/grade-school | PASS |
| polyglot/javascript/grep | PASS |
| polyglot/javascript/house | PASS |
| polyglot/javascript/killer-sudoku-helper | PASS |
| polyglot/javascript/ledger | PASS |
| polyglot/javascript/list-ops | PASS |
| polyglot/javascript/meetup | PASS |
| polyglot/javascript/ocr-numbers | PASS |
| polyglot/javascript/palindrome-products | PASS |
| polyglot/javascript/parallel-letter-frequency | PASS |
| polyglot/javascript/phone-number | PASS |
| polyglot/javascript/pig-latin | PASS |
| polyglot/javascript/poker | PASS |
| polyglot/javascript/promises | PASS |
| polyglot/javascript/queen-attack | PASS |
| polyglot/javascript/rational-numbers | PASS |
| polyglot/javascript/react | PASS |
| polyglot/javascript/rectangles | PASS |
| polyglot/javascript/resistor-color-trio | PASS |
| polyglot/javascript/rest-api | PASS |
| polyglot/javascript/robot-name | PASS |
| polyglot/javascript/say | PASS |
| polyglot/javascript/simple-linked-list | PASS |
| polyglot/javascript/scale-generator | PASS |
| polyglot/javascript/space-age | PASS |
| polyglot/javascript/state-of-tic-tac-toe | PASS |
| polyglot/javascript/tournament | PASS |
| polyglot/javascript/sum-of-multiples | PASS |
| polyglot/javascript/transpose | PASS |
| polyglot/javascript/triangle | PASS |
| polyglot/javascript/twelve-days | PASS |
| polyglot/javascript/two-bucket | PASS |
| polyglot/javascript/variable-length-quantity | PASS |
| polyglot/javascript/word-search | PASS |
| polyglot/javascript/wordy | PASS |
| polyglot/javascript/zebra-puzzle | PASS |
| polyglot/javascript/zipper | PASS |
| polyglot/go/alphametics | PASS |
| polyglot/go/beer-song | PASS |
| polyglot/go/book-store | PASS |
| polyglot/go/bottle-song | PASS |
| polyglot/go/connect | PASS |
| polyglot/go/bowling | PASS |
| polyglot/go/counter | PASS |
| polyglot/go/crypto-square | PASS |
| polyglot/go/dnd-character | PASS |
| polyglot/go/dominoes | PASS |
| polyglot/go/error-handling | PASS |
| polyglot/go/food-chain | PASS |
| polyglot/go/forth | PASS |
| polyglot/go/hexadecimal | PASS |
| polyglot/go/kindergarten-garden | PASS |
| polyglot/go/markdown | PASS |
| polyglot/go/ledger | PASS |
| polyglot/go/matrix | PASS |
| polyglot/go/octal | PASS |
| polyglot/go/paasio | PASS |
| polyglot/go/palindrome-products | PASS |
| polyglot/go/pig-latin | PASS |
| polyglot/go/poker | PASS |
| polyglot/go/pov | PASS |
| polyglot/go/protein-translation | PASS |
| polyglot/go/react | PASS |
| polyglot/go/say | PASS |
| polyglot/go/scale-generator | PASS |
| polyglot/go/simple-linked-list | PASS |
| polyglot/go/robot-simulator | PASS |
| polyglot/go/sublist | PASS |
| polyglot/go/transpose | PASS |
| polyglot/go/tree-building | PASS |
| polyglot/go/trinary | PASS |
| polyglot/go/two-bucket | PASS |
| polyglot/go/variable-length-quantity | PASS |
| polyglot/go/word-search | PASS |
| polyglot/go/wordy | PASS |
| polyglot/rust/accumulate | PASS |
| polyglot/go/zebra-puzzle | PASS |
| polyglot/rust/acronym | PASS |
| polyglot/rust/alphametics | PASS |
| polyglot/rust/book-store | PASS |
| polyglot/rust/bowling | PASS |
| polyglot/rust/decimal | PASS |
| polyglot/rust/dot-dsl | PASS |
| polyglot/rust/fizzy | PASS |
| polyglot/rust/doubly-linked-list | PASS |
| polyglot/rust/gigasecond | PASS |
| polyglot/rust/forth | PASS |
| polyglot/rust/grade-school | PASS |
| polyglot/rust/grep | PASS |
| polyglot/rust/luhn-from | PASS |
| polyglot/rust/macros | PASS |
| polyglot/rust/nucleotide-codons | PASS |
| polyglot/rust/ocr-numbers | PASS |
| polyglot/rust/parallel-letter-frequency | PASS |
| polyglot/rust/pig-latin | PASS |
| polyglot/rust/poker | PASS |
| polyglot/rust/react | PASS |
| polyglot/rust/robot-name | PASS |
| polyglot/rust/say | PASS |
| polyglot/rust/simple-cipher | PASS |
| polyglot/rust/scale-generator | PASS |
| polyglot/rust/two-bucket | PASS |
| polyglot/rust/variable-length-quantity | PASS |
| polyglot/rust/word-count | PASS |
| polyglot/rust/wordy | PASS |
| polyglot/rust/xorcism | PASS |
| polyglot/java/affine-cipher | PASS |
| polyglot/java/all-your-base | PASS |
| polyglot/java/alphametics | PASS |
| polyglot/java/bank-account | PASS |
| polyglot/java/book-store | PASS |
| polyglot/java/bottle-song | PASS |
| polyglot/java/bowling | PASS |
| polyglot/java/change | PASS |
| polyglot/java/circular-buffer | PASS |
| polyglot/java/connect | PASS |
| polyglot/java/custom-set | PASS |
| polyglot/java/dominoes | PASS |
| polyglot/java/food-chain | PASS |
| polyglot/java/forth | PASS |
| polyglot/java/go-counting | PASS |
| polyglot/java/hangman | PASS |
| polyglot/java/house | PASS |
| polyglot/java/kindergarten-garden | PASS |
| polyglot/java/ledger | PASS |
| polyglot/java/mazy-mice | PASS |
| polyglot/java/ocr-numbers | PASS |
| polyglot/java/palindrome-products | PASS |
| polyglot/java/phone-number | PASS |
| polyglot/java/pig-latin | PASS |
| polyglot/java/poker | PASS |
| polyglot/java/pov | PASS |
| polyglot/java/protein-translation | PASS |
| polyglot/java/pythagorean-triplet | PASS |
| polyglot/java/queen-attack | PASS |
| polyglot/java/rational-numbers | PASS |
| polyglot/java/react | PASS |
| polyglot/java/resistor-color-trio | PASS |
| polyglot/java/rest-api | PASS |
| polyglot/java/satellite | PASS |
| polyglot/java/series | PASS |
| polyglot/java/sgf-parsing | PASS |
| polyglot/java/simple-linked-list | PASS |
| polyglot/java/state-of-tic-tac-toe | PASS |
| polyglot/java/transpose | PASS |
| polyglot/java/tree-building | PASS |
| polyglot/java/twelve-days | PASS |
| polyglot/java/two-bucket | PASS |
| polyglot/java/variable-length-quantity | PASS |
| polyglot/java/word-search | PASS |
| polyglot/java/wordy | PASS |
| polyglot/java/zebra-puzzle | PASS |
| polyglot/java/zipper | PASS |

## Failures

11 failing (task × model) row(s).

- **polyglot/javascript/sum-of-multiples** · glm-5.3-flash #2 — `completed`
  ```
  test command timed out
  ```
- **polyglot/javascript/sum-of-multiples** · glm-5.3-flash #1 — `completed`
  ```
  test command timed out
  ```
- **polyglot/go/robot-simulator** · glm-5.3-flash #2 — `timeout`
  ```
  agent timed out (killed; tokens come from the transcript, cost is unknown)
  test command timed out
  ```
- **polyglot/go/robot-simulator** · glm-5.3-flash #3 — `timeout`
  ```
  agent timed out (killed; tokens come from the transcript, cost is unknown)
  test command timed out
  ```
- **polyglot/rust/xorcism** · glm-5.3-flash #2 — `completed`
  ```
  …0 ignored; 0 measured; 0 filtered out; finished in 0.01s
  
  
     Compiling xorcism v0.1.0 (C:\Users\ersin\AppData\Local\Temp\wstack-bench-QyAj42\work\glm-5-3-flash-b434a7ef2353__polyglot-rust-xorcism-8b889b719145__a2)
      Finished `test` profile [unoptimized + debuginfo] target(s) in 0.71s
       Running unittests src\lib.rs (target\debug\deps\xorcism-1c3fbde4ed1e3950.exe)
       Running tests\xorcism.rs (target\debug\deps\xorcism-7b72ebfc0954d4f1.exe)
  error: test failed, to rerun pass `--test xorcism`
  ```
- **polyglot/java/bottle-song** · glm-5.3-flash #3 — `completed`
  ```
  …e_warnings in the Gradle documentation.
  3 actionable tasks: 3 executed
  
  
  7 tests completed, 7 failed
  
  FAILURE: Build failed with an exception.
  
  * What went wrong:
  Execution failed for task ':test'.
  > There were failing tests. See the report at: file:///C:/Users/ersin/AppData/Local/Temp/wstack-bench-NAgE5v/work/glm-5-3-flash-b434a7ef2353__polyglot-java-bottle-song-72078ee07941__a3/build/reports/tests/test/index.html
  
  … (4 more line(s))
  ```
- **polyglot/java/connect** · glm-5.3-flash #3 — `timeout`
  ```
  agent timed out (killed; tokens come from the transcript, cost is unknown)
  …in the Gradle documentation.
  3 actionable tasks: 2 executed, 1 up-to-date
  
  
  10 tests completed, 4 failed
  
  FAILURE: Build failed with an exception.
  
  * What went wrong:
  Execution failed for task ':test'.
  > There were failing tests. See the report at: file:///C:/Users/ersin/AppData/Local/Temp/wstack-bench-NAgE5v/work/glm-5-3-flash-b434a7ef2353__polyglot-java-connect-69f7fe0c41de__a3/build/reports/tests/test/index.html
  … (5 more line(s))
  ```
- **polyglot/java/pythagorean-triplet** · glm-5.3-flash #1 — `timeout`
  ```
  agent timed out (killed; tokens come from the transcript, cost is unknown)
  …Gradle documentation.
  3 actionable tasks: 1 executed, 2 up-to-date
  
  
  9 tests completed, 2 failed
  
  FAILURE: Build failed with an exception.
  
  * What went wrong:
  Execution failed for task ':test'.
  > There were failing tests. See the report at: file:///C:/Users/ersin/AppData/Local/Temp/wstack-bench-NAgE5v/work/glm-5-3-flash-b434a7ef2353__polyglot-java-pythagorean-triplet-cdd3ff1161f0/build/reports/tests/test/index.html
  … (5 more line(s))
  ```
- **polyglot/java/pythagorean-triplet** · glm-5.3-flash #2 — `timeout`
  ```
  agent timed out (killed; tokens come from the transcript, cost is unknown)
  test command timed out
  ```
- **polyglot/java/react** · glm-5.3-flash #1 — `timeout`
  ```
  agent timed out (killed; tokens come from the transcript, cost is unknown)
  …mmand_line_warnings in the Gradle documentation.
  3 actionable tasks: 3 executed
  
  
  14 tests completed, 1 failed
  
  FAILURE: Build failed with an exception.
  
  * What went wrong:
  Execution failed for task ':test'.
  > There were failing tests. See the report at: file:///C:/Users/ersin/AppData/Local/Temp/wstack-bench-NAgE5v/work/glm-5-3-flash-b434a7ef2353__polyglot-java-react-ae074837c562/build/reports/tests/test/index.html
  … (5 more line(s))
  ```
- **polyglot/java/zebra-puzzle** · glm-5.3-flash #1 — `timeout`
  ```
  agent timed out (killed; tokens come from the transcript, cost is unknown)
  …in the Gradle documentation.
  3 actionable tasks: 1 executed, 2 up-to-date
  
  
  2 tests completed, 2 failed
  
  FAILURE: Build failed with an exception.
  
  * What went wrong:
  Execution failed for task ':test'.
  > There were failing tests. See the report at: file:///C:/Users/ersin/AppData/Local/Temp/wstack-bench-NAgE5v/work/glm-5-3-flash-b434a7ef2353__polyglot-java-zebra-puzzle-f7ba29fdbb14/build/reports/tests/test/index.html
  … (5 more line(s))
  ```
