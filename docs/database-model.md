# Database model

This diagram shows the schema created by the baseline migration
(`InitialSchema`) and the `Arenas` migration. Allowed values in parentheses are enforced by CHECK
constraints. The migration also adds partial unique indexes that the diagram
doesn't show: case-insensitive `username` and `email` among live users,
case-insensitive robot `name` per championship among live robots, and at most
one open pause (`resumed_at IS NULL`) per match.

An arena is a physical box that runs one match at a time. `arenas.current_match_id`
is the live pointer to the match the arena runs now (or will run next); it is
unique, so a match is current on at most one arena, and it is cleared when that
match is deleted. `matches.arena_id` is the history of where a match was played,
written when the match starts. `arenas.name` and `arenas.device_id` are unique;
`token_hash` is the bcrypt hash of the device token (`npm run seed:arena`).

`championships.created_by_user_id` is the owning account. Robots and matches
belong to that account through their championship.

The migrations in `apps/api/src/database/migrations/` stay the source of truth
for what is deployed. Update this diagram when a new migration changes the
schema.

```mermaid
---
config:
  look: neo
  layout: elk
---
erDiagram
  championships ||--o{ robots : "enrolls"
  championships ||--o{ matches : "hosts"
  robots ||--o{ matches : "fights as robot_a"
  robots ||--o{ matches : "fights as robot_b"
  users ||--o{ championships : creates
  users ||--o{ matches : creates
  users ||--o{ robots : creates
  matches ||--o{ match_pauses : "paused during"
  users ||--o{ match_pauses : pauses
  matches ||--o{ match_score_events : "scored in"
  robots  ||--o{ match_score_events : "scored for"
  robots ||--o{ matches : "wins"
  arenas |o--o| matches : "runs now (current_match_id)"
  arenas ||--o{ matches : "played on (arena_id)"

  users {
    uuid id PK
    string username
    string email
    string password
    timestamptz created_at
    timestamptz modified_at
    timestamptz deleted_at "nullable, soft delete"
  }
  championships {
    uuid id PK
    uuid created_by_user_id FK
    string name
    timestamptz start_date
    timestamptz end_date
    timestamptz created_at
    timestamptz modified_at
    timestamptz deleted_at "nullable, soft delete"
  }
  robots {
    uuid id PK
    uuid championship_id FK
    uuid created_by_user_id FK
    string name
    string weight_class "(fairyweight | antweight | beetleweight | hobbyweight | featherweight | lightweight)"
    string team
    timestamptz created_at
    timestamptz modified_at
    timestamptz deleted_at "nullable, soft delete"
  }
  matches {
    uuid id PK
    uuid championship_id FK
    uuid robot_a_id FK
    uuid robot_b_id FK
    uuid created_by_user_id FK
    uuid winner_robot_id FK "nullable"
    uuid arena_id FK "nullable, set at Start"
    string weight_class "(fairyweight | antweight | beetleweight | hobbyweight | featherweight | lightweight)"
    string state "scheduled | ongoing | paused | finished"
    string end_reason "(time_out | manual | surrender), nullable"
    timestamptz scheduled_at
    timestamptz started_at "nullable"
    timestamptz finished_at "nullable"
    timestamptz created_at
    timestamptz modified_at
    timestamptz deleted_at "nullable, soft delete"
  }
  arenas {
    uuid id PK
    string name "unique"
    string device_id "unique"
    string token_hash "bcrypt hash of the device token"
    uuid current_match_id FK "nullable, unique"
    timestamptz created_at
    timestamptz modified_at
    timestamptz deleted_at "nullable, soft delete"
  }
  match_score_events {
    uuid id PK
    uuid match_id FK
    uuid robot_id FK
    int judge_seat "(1 | 2 | 3)"
    int action "+1 | -1"
    timestamptz created_at
  }
  match_pauses {
    uuid id PK
    uuid match_id FK
    uuid paused_by_user_id FK
    timestamptz paused_at
    timestamptz resumed_at "nullable, null while the match is paused"
  }
```
