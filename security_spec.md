# Security Specification for WhatsCRM

## Data Invariants
1. A **User** must belong to a **Team**.
2. **Contacts**, **Conversations**, **Templates**, **Campaigns**, and **Custom Statuses** must all have a valid `teamId`.
3. Users can only access data belonging to their own `teamId`.
4. Only users with the `admin` role in their `userProfile` can modify certain team-wide settings or add team members.
5. Messages are stored within Conversations and inherit the team-based access of the parent Conversation.

## The "Dirty Dozen" Payloads (Denial Expected)

1. **Identity Spoofing**: Creating a `userProfile` for yourself but assigning a `teamId` you don't own.
2. **Cross-Team Read**: Trying to read a conversation from `team_A` while being a member of `team_B`.
3. **Privilege Escalation**: An `agent` trying to update their own `role` to `admin`.
4. **Orphaned Message**: Creating a `message` in a conversation that doesn't exist or belongs to another team.
5. **Ghost Field Injection**: Adding an `isVerified: true` field to a `contact` document.
6. **Malicious ID**: Creating a contact with a 2KB string as the ID.
7. **Bypassing Terminal State**: Trying to update a campaign status after it is `completed`.
8. **PII Leak**: An unauthenticated user trying to read the `users` collection.
9. **Tampering with Timestamps**: Sending a `createdAt` value from the future instead of `request.time`.
10. **Null Team Assignment**: Creating a contact without a `teamId`.
11. **Mass Delete**: An agent trying to delete the entire `contacts` collection.
12. **Unauthorized Metadata**: Trying to update the `team` name without being an `admin`.

## Test Cases (Proposed)
- `get(/users/{myId})` should succeed if authenticated.
- `list(/contacts)` where `teamId == myTeamId` should succeed.
- `create(/messages)` should succeed only if the parent conversation belongs to my team.
