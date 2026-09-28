## Why

A spin-off of my Operating Systems course project (Secure Code Judge Sandbox). System calls are hard to explain in words, so this turns the sequence into something you can step through.

## How it works

- The simulator is a pure TypeScript function, `simulate(scenario)`, returning the syscall sequence and a verdict (AC / TLE / MLE / SV)
- Unit tests check that every scenario runs `fork → setrlimit → seccomp → execve` in order and ends with `wait4`
- The UI separates the judge, the child process and the kernel so you can see who does what

## Accessibility

- Step with buttons or the keyboard — nothing auto-plays unless you press Play
- Every step is announced to screen readers (aria-live)
- No animation when "reduce motion" is on
