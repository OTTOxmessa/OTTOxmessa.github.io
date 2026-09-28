## Overview

A sandbox for running submitted code, online-judge style, built directly on Linux system calls.

## How it works

1. `fork()` a child process for the submission
2. Set limits with `setrlimit()` (CPU time, memory)
3. Filter dangerous system calls with `seccomp`
4. `execve()` the program, with `alarm()` / signals to stop runaway code
5. `wait4()` to collect the result, time and memory usage

A web demo that animates each step is planned.
