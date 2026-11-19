# Source

Vendored from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT, see LICENSE), commit 2de1134dc4d1cfe112934611ae5803ae17a1bd7e, v2.15.0.
Reviewed before adding: the Python scripts make no network calls and run no subprocesses; they write only to a `design-system/` folder or a temp file.

Local changes: only `SKILL.md`, where the plugin-only `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/…` script paths became project-relative `.claude/skills/ui-ux-pro-max/…`. The upstream test suite is not included.
