#!/usr/bin/env bash
# Upload an existing video file as a match's recording, the same 3 steps the web app runs:
#   1. POST /matches/:id/recording/upload-url   -> presigned R2 PUT url + key
#   2. PUT the file to R2 (same Content-Type and exact size as step 1)
#   3. POST /matches/:id/recording/complete      -> the API queues the analysis job
# For testing the CV worker on a deployed stack: the web app itself only uploads what it records.
#
# Usage (from the repository root):
#   API=https://<host>/crossliseu/api apps/cv-worker/tools/upload-video.sh <matchId> <file.mp4|file.webm> [username]
# The user must own the match's championship. Each upload replaces the match's video.
#
# Files that should end in "failed" / video_unreadable:
#   head -c 300000 /dev/urandom > not-a-video.mp4      # not a video at all
#   head -c 300000 fight.mp4 > truncated.mp4           # cut off before the index (moov)
set -euo pipefail

: "${API:?set API, e.g. API=https://<host>/crossliseu/api}"
MATCH_ID=${1:?matchId}
FILE=${2:?video file}
USERNAME=${3:-admin}

case "$FILE" in
  *.webm) TYPE=video/webm ;;
  *) TYPE=video/mp4 ;;
esac
SIZE=$(wc -c < "$FILE" | tr -d ' ')
json() { python3 -c "import json,sys; print(json.load(sys.stdin)[sys.argv[1]])" "$1"; }

read -rsp "Password for $USERNAME: " PASSWORD; echo
TOKEN=$(curl -fsS "$API/auth/login" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$USERNAME" "$PASSWORD")" \
  | json token)

echo "1/3 asking for an upload URL ($TYPE, $SIZE bytes)"
UPLOAD=$(curl -fsS "$API/matches/$MATCH_ID/recording/upload-url" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"contentType\":\"$TYPE\",\"size\":$SIZE}")
URL=$(echo "$UPLOAD" | json url)
KEY=$(echo "$UPLOAD" | json key)

echo "2/3 uploading to R2 as $KEY"
curl -fsS -X PUT "$URL" -H "Content-Type: $TYPE" --upload-file "$FILE" -o /dev/null

echo "3/3 confirming the upload"
curl -fsS "$API/matches/$MATCH_ID/recording/complete" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"key\":\"$KEY\",\"size\":$SIZE}" -o /dev/null

echo "Done. Analysis status:"
echo "  curl -s -H 'Authorization: Bearer <token>' $API/matches/$MATCH_ID/analysis"
echo "or watch: docker compose -f compose.prod.yml logs -f cv-worker"
