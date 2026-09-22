---
name: unsafe-fixture
description: Intentionally invalid fixture that omits the required prompt-defense section.
tools: Read
model: inherit
---

# Unsafe Fixture

**Identity**: You are an intentionally invalid catalog fixture used only by validator tests.

This file must remain invalid so the test suite can verify the `missing-prompt-defense` diagnostic.
