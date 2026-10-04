# Phase 5 — Agents and MCP

**Weeks 25–29** · `uv sync --group llm --group agents`

Give models tools and let them act, with loops you understand and can debug.

## Checklist

- [ ] Read: [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [ ] **Build:** an agent loop from scratch, no framework
- [ ] [Model Context Protocol](https://modelcontextprotocol.io): servers, tools, resources, transports
- [ ] **Build:** your own MCP server (timetable, notes, test reports…)
- [ ] [Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview) and Claude Code: subagents, hooks, skills
- [ ] Patterns: orchestrator–workers, evaluator–optimizer, human-in-the-loop

## Ship

An agent that completes a multi-step task through your MCP server, with traces you can replay.

## Where things go

- Your work: `05-agents-mcp/<your-github-username>/`
- Anything more than one of you reuses: `shared/` + a test in `tests/`
- Tick items on the [lab website](https://twadi.github.io/ai-eng-lab/) too
