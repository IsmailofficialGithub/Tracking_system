---
description: General coding rules and project structure guidelines
---

# Clean Code & Project Structure Rules

When writing code in this repository, you must adhere to the following guidelines:

1. **Follow the Folder Structure**: Strictly adhere to the established folder structure (`Backend`, `Database`, `Frontend`, `Infra`). Place new files in the correct domain/module folders logically.
2. **Clean Code**: Keep the code readable, maintainable, and modular. Do not write monolithic functions.
3. **No Wildcard Imports / Comments**: 
   - Avoid wildcard imports in Rust (e.g., `use module::*`). Always import explicitly.
   - Avoid block comments (`/* ... */`). Prefer standard line comments (`// ...`) for clarity and consistency.
4. **File Length**: Prevent files from becoming too long. If a file exceeds a reasonable length (e.g., ~200-300 lines), break it down into smaller, modular files and modules.
