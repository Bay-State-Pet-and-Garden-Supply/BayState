---
active: true
iteration: 2
completion_promise: "DONE"
initial_completion_promise: "DONE"
started_at: "2026-03-19T15:17:09.194Z"
session_id: "ses_2f953fe53ffeVeaiBJ5xOtwijO"
ultrawork: true
strategy: "continue"
message_count_at_start: 1
---
I keep getting this error for login scrapers on the live runners "{"timestamp": "2026-03-19T10:20:22.132133+00:00", "level": "WARNING", "logger": "scrapers.actions.handlers.login", "message": "Missing credentials for petfoodex, skipping login"}" but it was working fine during testing locally. Is there an issue with how we are getting the credentials? Are we using the wrong decryption key?
