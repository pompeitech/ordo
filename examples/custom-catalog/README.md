# Minimal custom catalog

This catalog is deliberately small but structurally complete. It contains one agent, one rule, one skill, and one workflow, each following Ordo's current validation contract.

Use it as an authoring reference, not as a production engineering policy. The entries demonstrate required frontmatter, the `Prompt Defense Baseline`, identity declarations, skill paths, and workflow sections.

Validate it through a dry run:

```bash
ordo install /path/to/project --content-root /path/to/ordo/examples/custom-catalog --dry-run
```

Catalog `README.md` files are documentation only and are not loaded as entries.
