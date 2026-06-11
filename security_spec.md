# Security Specification for Polling App

## Data Invariants
1. A poll must have a valid non-empty string `id`.
2. The `content` must be a string of length greater than 0 and less than or equal to 120 characters.
3. `createdBy` must correspond to the anonymous user's `visitorId` (provided in the client payload) or "system".
4. `votes` must be an array containing unique strings, representing visitorIds that voted.
5. All IDs (visitorId, pollId) must only contain alphanumeric characters, underscores, or hyphens.

## The "Dirty Dozen" Payloads (Denial Scenarios)
1. Creating a poll with empty `content`.
2. Creating a poll with `content` exceeding 120 characters to Bloat Firebase database storage.
3. Injected script/tags in `content` to perform XSS attacks.
4. Setting `createdBy` to another user's visitorId (identity spoofing).
5. Attempting to create a poll with `votes` array containing hundreds of mock items.
6. Attempting to update `createdBy` after creation (modifying immutable fields).
7. Attempting to update `createdAt` after creation (modifying immutable fields).
8. Attempting to update the `content` of a poll to deface it once created (immutability of proposal content).
9. Attempting to delete a poll that was created by another user when the visitor is not an Admin (Security Passcode 123456 bypass).
10. Attempting to vote multiple times by duplicating own visitorId in the array on update.
11. Attempting to inject non-string elements into the `votes` array.
12. Creating a poll with a non-string or ultra-long document ID.

## Firestore Rules Draft Validation
The rules will prevent any of the above operations.
