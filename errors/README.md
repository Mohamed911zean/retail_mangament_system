# Debug Error Artifacts

This directory stores repository artifacts captured while diagnosing a specific
section or Phase 0 step. Keep the structure deterministic:

```text
errors/
  README.md
  phase-0/
    step-<number>/
      <short-error-name>.png
      README.md
```

Runtime application errors are written to the client machine, not this source
folder:

```text
%APPDATA%\small_erp\logs\main.log
```

Each captured artifact should include a short README with the command or flow,
observed error, cause if known, and resolution.
