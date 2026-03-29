# Brand Language Guide

```
 /\_/\
( o.o )  serious infra, cat personality
 > ^ <
```

paws uses cat-themed names as a conceptual vocabulary for explaining the architecture. The
metaphor is structural, not decorative — "the control plane picks a tree, the tree builds a
box, a kitten runs inside it." These names live in documentation and conversation, not in the
CLI or dashboard UI, which use standard infrastructure terms (workers, sessions, VMs).

See [concepts.md](concepts.md) for the full domain glossary.

---

## 1. Voice

### The Rule

Write like a smart engineer explaining something at a whiteboard. Technically precise, genuinely
helpful, warm but never silly. The cat personality adds texture, not noise.

### Voice Attributes

| Attribute        | What it means                                   | What it doesn't mean      |
| ---------------- | ----------------------------------------------- | ------------------------- |
| **Clear**        | One right reading. No ambiguity.                | Dumbed down.              |
| **Warm**         | Friendly, approachable, human                   | Goofy, cutesy, try-hard   |
| **Technical**    | Precise terms, real numbers, actual file paths  | Jargon soup, academic     |
| **Confident**    | Take a position. "This is how it works."        | Arrogant, dismissive      |
| **Cat-flavored** | Occasional cat references that earn their place | Cat pun in every sentence |

### Good vs. Bad

```
GOOD: "Each kitten runs in its own box — an ephemeral Firecracker VM with its own
      network namespace, its own proxy, and its own CA. Nothing worth stealing inside."

BAD:  "Our purr-fectly isolated micro-VMs keep your secrets safe! Meow-velous security!"

GOOD: "Box failed to start: snapshot 'agent-latest' not found on tree-01.
      Run 'paws snapshots list' to see available snapshots."

BAD:  "Oopsie! The kitty can't find its bed! Try rebuilding the snapshot, nya~"
```

### The Cat Ratio

The cat mascot (ASCII art) appears once per CLI command output, at the top. The vocabulary
(tree, box, kitten) is always present because it IS the terminology, not decoration. Cat
puns and decorative references appear nowhere. The personality comes from the vocabulary
being structural, not from layering jokes on top.

- ASCII cat in the CLI header: yes
- Cat pun in every error message: absolutely not
- "box" and "tree" in status output: yes (they're the vocabulary)
- "purr-fect" anywhere: never

### Docs Voice

Match Tailscale's docs energy. Teach while informing. Use second person ("you"). Short
paragraphs. Real examples with real values.

```
GOOD: "When you create a session, paws picks the least-loaded tree in your fleet,
      spins up a fresh box, and drops your kitten inside. The box is destroyed when
      the session ends — there's nothing to clean up."

BAD:  "The session creation process involves the scheduler selecting an appropriate
      worker node based on current utilization metrics, instantiating a new virtual
      machine instance, and executing the configured workload therein."
```

## 2. Terminology

### The Two Layers

| Internal (API/code)  | User-facing (CLI/docs/dashboard) | What it is                                  |
| -------------------- | -------------------------------- | ------------------------------------------- |
| `worker`             | **tree**                         | Bare metal server running VMs               |
| `vm` / `session`     | **box**                          | Firecracker VM sandbox                      |
| `agent` / `workload` | **kitten**                       | AI agent running inside a box               |
| `control-plane`      | **control plane**                | Central orchestrator (kept standard)        |
| `daemon`             | **daemon**                       | Persistent role (kept standard)             |
| `snapshot`           | **snapshot**                     | Pre-built VM image (kept standard)          |
| `trigger`            | **trigger**                      | Event that spawns a session (kept standard) |

A box always contains exactly one kitten. "Kitten" is used as a collective/count noun
("3 kittens running") while "box-XXXX" is used as the identifier. You say "3 kittens
active" but inspect `box-7e22`. The box is the observable unit — kittens don't have
their own IDs because a kitten cannot exist outside a box.

### When to Use Which

- **Docs and conceptual explanations:** Cat terms (tree, box, kitten) to teach architecture.
- **API, CLI, dashboard, error messages, logs, code:** Standard terms (worker, session, VM).

The cat vocabulary is a teaching tool for understanding the system, not a replacement for
standard infrastructure terminology in the product itself.

### Naming IDs in CLI Output

Internal IDs are UUIDs or hashes. In CLI output, show shortened friendly versions:

| Internal               | CLI display | Rule                                                                                |
| ---------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `worker-a3f1e2b4-...`  | `tree-01`   | Stable index assigned on first discovery, never reused. Persisted in control plane. |
| `session-7e22d901-...` | `box-7e22`  | First 4 chars of session ID (extend to 6 on collision)                              |
| daemon name            | daemon name | User-defined, unchanged                                                             |

Tree names are stable across restarts. If tree-02 is removed and a new worker joins,
it becomes tree-03, not tree-02.

## 3. ASCII Art

### The Cat Mascot

The paws mascot appears in three contexts:

**Header cat** — appears once at the top of major CLI output and doc sections:

```
 /\_/\
( o.o )
 > ^ <
```

**Healthy cat** — in status output when fleet is healthy:

```
 /\_/\
( ^.^ )
 > ^ <
```

**Alert cat** — in status output when something needs attention:

```
 /\_/\
( o.o )!
 > ^ <
```

### Rules

1. **One cat per screen.** Never stack multiple ASCII cats. One is charming, two is clutter.
2. **Cats are status indicators.** The cat's expression communicates state at a glance.
3. **Cats appear in headers, not inline.** Never mid-paragraph. Always at the top or as a
   section separator.
4. **Docs cats are static.** The three-line cat appears at the top of each doc file (already
   established in the codebase). Keep this pattern.
5. **No cat animations.** ASCII spinners or loading cats are tempting. Resist.

## 4. Error Messages

### Pattern

```
{what happened}: {specific detail}.
{what to do about it}.
```

Errors use user-facing terminology but never add cat personality to the error itself.
The vocabulary (tree, box, kitten) IS the personality — you don't need to add more.

### Examples

```
Box failed to start on tree-01: snapshot 'agent-latest' not found.
Run 'paws snapshots list' to see available snapshots, or 'paws snapshots rebuild agent-latest'.

Tree tree-02 is unreachable: health check timed out after 5s.
Check that the worker process is running on the node.

Kitten timed out after 600s on tree-01 (box-a3f1).
The session has been terminated. Increase timeout with --timeout or check the workload script.

No trees available: all workers are at capacity (5/5 boxes each).
Wait for running sessions to complete, or add another worker node.
```

### What NOT to do

```
BAD: "Uh oh! The kitten couldn't find its box!"
BAD: "Meow! Something went wrong."
BAD: "The cat tree fell over (worker unreachable)."
BAD: "Purr-mission denied."
```

## 5. CLI Output Mockups

### `paws status`

The flagship command. One glance tells you the state of the fleet.

```
 /\_/\   paws v0.5.0
( ^.^ )  2 trees, 3 kittens active
 > ^ <

TREES
  NAME       BOXES     STATUS     UPTIME
  tree-01    2/5       healthy    3d 14h
  tree-02    1/5       healthy    3d 14h

ACTIVE KITTENS
  ID         DAEMON          TREE       AGE       STATUS
  box-a3f1   pr-reviewer     tree-01    4m 32s    running
  box-7e22   issue-triage    tree-01    1m 08s    running
  box-d901   deploy-check    tree-02    12m 44s   finishing
```

When the fleet has issues:

```
 /\_/\   paws v0.5.0
( o.o )! 1 tree, 0 kittens active (1 tree unreachable)
 > ^ <

TREES
  NAME       BOXES     STATUS                       UPTIME
  tree-01    0/5       healthy                      3d 14h
  tree-02    ---       unreachable (last seen 3m)   ---

NO ACTIVE KITTENS
```

## 6. README and Marketing Voice

### Tagline Options (ranked)

1. **"Zero-trust credential injection for AI agents."** (current — keep it)
2. **"Your agent doesn't need your API keys."** (current subheading — keep it)
3. **"Secrets stay on the host. Agents stay in the box."** (new option, uses vocabulary)

### README Recommendations

- Keep the technical accuracy. Don't sacrifice clarity for personality.
- The README does not include the ASCII cat header. ASCII cats live in CLI output and doc
  file headers.
- Use user-facing terms in examples: `# This creates a box on the least-loaded tree`
- The "Key Properties" section should stay technical. No cat flavor needed there.

## 7. Dashboard Voice

- Use user-facing terms throughout (trees, boxes, kittens)
- Status cards show the same data as CLI but in a visual layout
- The ASCII cat doesn't appear in the dashboard (it's a CLI/docs thing)
- Tone: informational, not playful. "3 kittens active across 2 trees" not "3 kittens are playing!"
- Error states: same pattern as CLI errors. What happened, what to do.

Dashboard voice guidelines will be expanded when the dashboard UI is redesigned (roadmap v1.0 #30).

## 8. Things We Explicitly Won't Do

| Thing                                           | Why not                                   |
| ----------------------------------------------- | ----------------------------------------- |
| Cat puns (purr-fect, meow-velous, hiss-terical) | Undermines technical credibility          |
| Emojis in CLI output                            | ASCII art is the aesthetic, not emoji     |
| Cat sounds in error messages                    | Errors should help, not entertain         |
| Different cat breeds per daemon                 | Cool idea but deferred                    |
| Cat-themed HTTP status codes                    | The API is the contract, keep it standard |
| "nya~" or anime cat references                  | Wrong audience entirely                   |
| Renaming API endpoints                          | Standard terms at the contract layer      |
