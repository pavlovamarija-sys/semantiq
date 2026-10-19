# Active-path verification

`app.main` and the Next.js conversion/action modules were not modified. The active CELEX path still calls the existing `/analyze/pdf` and `/convert/pdf-to-docx` worker endpoints and retains the previous response attestations, storage, status and downstream behavior. The extracted package is inactive and is invoked only by tests/regression runners.
