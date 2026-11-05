# Database model

This diagram shows the database we are working toward. It is not the current
schema. Some tables, columns, relationships and allowed values below don't exist
yet, or exist in a different form. Use it to guide new entities and migrations.

For the schema as it is today, read the migrations in
`apps/api/src/database/migrations/`. Those are the source of truth for what is
actually deployed.

```mermaid
---
config:
  theme: default
  look: classic
  layout: dagre
---
erDiagram
  championships ||--o{ robots : "enrolls"
  championships ||--o{ matches : "hosts"
  robots ||--o{ matches : "fights as robot_a"
  robots ||--o{ matches : "fights as robot_b"
  users ||--o{ championships : creates
  users ||--o{ matches : creates
  users ||--o{ robots : creates

  users {
    uuid id PK
    string username
    string email
    string password
    timestamptz created_at
    timestamptz modified_at "nullable"
    timestamptz deleted_at "nullable, soft delete"
  }
  championships {
    uuid id PK
    created_by user_id FK
    string name
    timestamptz start_date
    timestamptz end_date
    timestamptz created_at
    timestamptz modified_at "nullable"
    timestamptz deleted_at "nullable, soft delete"
  }
  robots {
    uuid id PK
    uuid championship_id FK
    uuid created_by FK
    string name
    string weight_class "(fairyweight | antweight | beetleweight | hobbyweight | featherweight | lightweight"
    string team
    timestamptz created_at
    timestamptz modified_at "nullable"
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
    timestamptz modified_at "nullable"
    timestamptz deleted_at "nullable, soft delete"
  }
  match_score_events {
    uuid id "PK"
    uuid match_id "FK"
    uuid robot_id "FK"
    int judge_id "(1 | 2 | 3)"
    int action "+1 | -1"
  }
```
