# Owner-only accounts and safe backend tests

PetConnect supports pet-owner accounts. Clinic sign-in, clinic portal routes, clinic provisioning and clinical write APIs have been retired. Existing clinic locations and veterinary records remain as historical owner data. An appointment saved in the app is an owner's calendar entry; the owner contacts the clinic directly to confirm the visit.

The retirement migration disables historical clinic identities and their devices and queued notifications. It preserves users, clinic locations and clinical records so existing foreign-key references and author names remain valid. `CLINIC` in historical SQL enum values is a storage compatibility detail; it is not an available application role.

Backend integration tests must run with `NODE_ENV=test`, a resolved MySQL database ending in `_test` or `_e2e`, and the dedicated Auth emulator at `127.0.0.1:9199` using `demo-petconnect-test`. Guards execute before server initialization and recheck the actual connected database before schema writes and table resets. Test bootstrap ignores live Firebase credentials and resets only that isolated Auth emulator.

The complete migration/backup suite creates temporary databases. Use a separate MySQL test instance and test-only credentials that can create and drop those databases. Set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER` and `MYSQL_PASSWORD` for that instance before running the root backend test scripts. Do not grant development or production application credentials broad database administration permissions.

Push notifications use durable per-device jobs committed with the inbox notification. The worker retries transient failures with exponential backoff, retains failed jobs after ten attempts, checks current device ownership, and records accepted Expo tickets for receipt processing. Inbox deduplication does not discard a pending push retry. Push transport provides at-least-once delivery; a crash after provider acceptance can produce a duplicate device push, while the inbox retains one notification.
