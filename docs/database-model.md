# Database model

This diagram shows the schema created by the baseline migration
(`InitialSchema`). Allowed values in parentheses are enforced by CHECK
constraints. The migration also adds partial unique indexes that the diagram
doesn't show: case-insensitive `username` and `email` among live users,
case-insensitive robot `name` per championship among live robots, and at most
one open pause (`resumed_at IS NULL`) per match.

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
