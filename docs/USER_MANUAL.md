# PetConnect User Manual

## 1. What PetConnect does

PetConnect helps pet owners manage pet identity, recovery tags, lost-pet reports, sightings, recovery updates, notifications, and personal care reminders.

The app is designed around two main experiences:

- **Pet owner experience** — create an account, register pets, manage Pet IDs and recovery tags, report a pet lost, review finder reports, and manage care reminders.
- **Finder experience** — scan a PetConnect QR tag or enter its short code, view a recovery-safe pet profile, and send a sighting or found-pet report without needing a PetConnect owner account.

This manual documents the owner and finder/recovery features intended to remain in the app.

---

## 2. Main navigation

Signed-in pet owners use five primary tabs:

| Tab | Purpose |
| --- | --- |
| **Home** | Overview of pets, upcoming care, and quick recovery actions |
| **Pets** | View and manage registered pets |
| **Scan** | Scan a PetConnect QR tag, enter a PetConnect code, or search for nearby lost pets |
| **Recovery** | View nearby lost pets, create lost reports, and manage active recovery cases |
| **Profile** | View account details, privacy settings, pet count, and sign out |

The **Scan** and public recovery flow can also be used by a finder who is not signed in.

---

## 3. Getting started

### Create an account

1. Open PetConnect.
2. Tap **Get Started**.
3. Choose **Create Account**.
4. Enter the required account information.
5. Complete registration.
6. After setup, PetConnect opens the owner dashboard.

### Sign in

1. Tap **Get Started**.
2. Enter your email and password.
3. Tap **Sign in**.

### Reset a password

From the sign-in screen, choose **Forgot password** and follow the reset flow.

### Sign out

1. Open **Profile**.
2. Tap **Log out**.
3. Confirm the sign-out action.

---

## 4. Home dashboard

The Home screen gives the owner a quick view of the most important information.

It can show:

- registered pets;
- direct access to a pet's Pet ID;
- upcoming personal care reminders;
- a shortcut to the full care calendar;
- a **Report Lost Pet** action when pets are registered;
- a shortcut to notifications;
- an **Add your first pet** action when the account has no pets.

---

## 5. Pet management

Open **Pets** to manage all pets registered under the current owner account.

### Add a pet

1. Open **Pets**.
2. Tap **Add pet** or **Add your first pet**.
3. Add a pet photo if available.
4. Enter the pet information.
5. Save the pet.

Pet profiles currently support:

- pet name;
- species;
- breed;
- sex;
- age;
- identifying details;
- microchip number;
- pet photo.

PetConnect assigns the pet a unique Pet ID after it is saved.

### Pet photo handling

The app can:

- choose an image from the device;
- optimize the selected image when possible;
- keep the original image if optimization is unavailable;
- show the selected image before saving;
- replace or remove an existing pet photo.

### Edit a pet

From **Pets** or the pet's **Pet ID** screen, choose **Edit** and save the updated information.

### Delete a pet

The **Pet ID** screen contains a delete action with confirmation. Deleting a pet also removes its associated recovery tags.

---

## 6. Pet ID

Each registered pet has a Pet ID screen that acts as the pet's identity and recovery-management center.

The screen can show:

- pet name and photo;
- breed/species;
- sex and age information;
- microchip information for the owner;
- number of active recovery tags;
- recovery tag status;
- tag scan history and scan count.

From this screen, the owner can also edit or delete the pet.

---

## 7. Recovery tags and QR codes

A pet can have multiple recovery tags.

Supported tag types include:

- **Collar**
- **Harness**
- **Print**
- **Sticker**

Each tag can have its own label, such as **Main collar** or **Travel harness**.

### Create a recovery tag

1. Open the pet's **Pet ID**.
2. Tap **+ New tag**.
3. Enter an optional tag name.
4. Choose the tag type.
5. Tap **Create tag**.

### Open a tag

An active tag can be opened to display a printable/shareable PetConnect recovery card containing:

- pet name;
- **I'M LOST** message;
- QR code;
- PetConnect short code;
- recovery instructions.

### Export a tag

Depending on the platform, the owner can:

- **Download** the tag image on web;
- **Print** the tag on web;
- **Share** the recovery link/tag information on mobile.

This allows owners to print their own stickers, paper tags, cards, or other physical labels instead of requiring a specific PetConnect accessory.

### Tag lifecycle

Each tag can be managed independently.

Available actions include:

- **Replace** — rotate the recovery identity when replacing a physical tag;
- **Mark lost** — mark the physical tag itself as lost;
- **Disable** — revoke a tag so it can no longer be used as an active recovery tag.

The app also records the tag's scan count and most recent scan date.

---

## 8. Scanning a PetConnect tag

The **Scan** screen supports three ways to identify a pet.

### QR scan

1. Open **Scan**.
2. Allow camera access.
3. Point the camera at the PetConnect QR code.
4. PetConnect opens the public recovery profile.

Only valid PetConnect recovery QR data is accepted.

### Short code

If the QR cannot be scanned:

1. Enter the PetConnect short code, such as **PC-12AB34CD**.
2. Tap **Open**.
3. PetConnect resolves the code and opens the recovery profile.

### No-tag nearby search

If no tag is available:

1. Tap **Can't scan a tag?**
2. Optionally select a species.
3. Optionally enter a possible breed.
4. Optionally describe the pet's appearance, such as color, markings, or collar.
5. Tap **Find nearby pets**.

PetConnect uses the device location to search active lost-pet reports within approximately 10 km and shows possible matches with distance and match reasons.

Selecting a result opens the recovery/report flow for that lost pet.

---

## 9. Public recovery profile

A finder can open a recovery profile without signing into an owner account.

The public profile can show:

- pet name;
- pet photo;
- species/breed;
- sex;
- identifying details intended for recognition;
- whether the pet is microchipped;
- whether the pet is currently reported lost;
- the last-known area for an active lost report;
- a map of the published recovery location;
- the owner's recovery phone number only when the owner has chosen to share it.

The actual microchip number is not shown on the public recovery profile.

---

## 10. Finder reporting

A finder can report either that they **have the pet** or that they **saw the pet**.

### If the finder has the pet

The app asks for:

- a current photo of the pet;
- current GPS location or a typed nearby street/landmark;
- optional finder name;
- optional finder contact information;
- an explicit choice to share contact information with the owner;
- optional notes.

A current photo is required for a **have this pet** report.

### If the finder only saw the pet

The finder can submit:

- GPS location or a typed location;
- an optional photo;
- optional name/contact;
- optional notes.

### Phone verification

For higher-risk or abuse-sensitive submissions, PetConnect can require phone verification.

The flow can:

1. request a verification code;
2. send the one-time code;
3. verify the phone;
4. continue the pending report after successful verification.

### Successful submission

After a finder report is accepted, the finder receives a report reference and can return to the recovery profile or submit another update.

---

## 11. Reporting a pet lost

Owners can start a lost report from **Home**, **Pets**, or **Recovery**.

The lost-report flow asks for:

1. the pet;
2. where the pet was last seen;
3. a location from GPS or the map;
4. optional extra details;
5. confirmation to publish.

Once published, the case becomes part of the PetConnect recovery network.

---

## 12. Recovery screen

The **Recovery** tab has two main views.

### Nearby

Shows active lost-pet cases around the owner's current location.

The app can:

- request the device location;
- show nearby cases within the configured nearby radius;
- display pet name, type/breed, status, and location information;
- refresh the nearby list.

### My cases

Shows the owner's own lost-pet reports.

For each case, PetConnect can show:

- current status;
- original last-seen location;
- latest finder-reported location;
- number of sightings;
- chronological recovery trail on the map;
- individual finder sightings;
- date/time of sightings;
- **Mark Reunited** action.

Case status progresses through the recovery lifecycle, including:

- **LOST**
- **SIGHTED**
- **REUNITED**

---

## 13. Recovery map and trail

For an active case, PetConnect can build a recovery trail containing:

- the owner's original lost location;
- accepted finder sightings;
- a finder location where someone reports having the pet.

This creates a visual sequence of where the pet was lost and where it was later seen or found.

Blocked or rejected sightings are not used as accepted trail points.

---

## 14. Finder report review

When an owner opens a finder report, the app can show:

- whether the report is verified;
- whether a photo is attached;
- whether the finder phone was verified;
- whether the finder chose to share contact details;
- finder-submitted photo;
- finder location;
- finder name when supplied;
- finder message/notes;
- finder contact when shared;
- recovery timeline.

The owner can also:

- call the finder when a shared contact is available;
- report an abusive or suspicious finder submission;
- mark the pet as reunited after the pet is safely recovered.

---

## 15. Lost-pet poster sharing

For an active lost report, PetConnect can prepare a missing-pet poster.

Depending on the platform, the owner can:

- **Share poster** on mobile;
- **Print poster** on web.

The poster is built from the current lost-pet case information so it can be distributed outside the app.

---

## 16. Notifications

The Notifications screen collects PetConnect activity that needs the owner's attention.

The app supports:

- in-app notification history;
- refresh;
- opening the related PetConnect item from a notification;
- enabling push notifications on supported mobile builds;
- push-token refresh handling;
- opening a recovery case or reminder directly from a notification.

If no notifications are pending, the app shows an **all caught up** state.

---

## 17. Personal care reminders

PetConnect includes personal care reminders for owners.

Owners can:

- create a reminder for a selected pet;
- set an exact date and time;
- view upcoming reminders on Home;
- view reminders in the care calendar;
- open reminder details;
- mark a reminder completed;
- mark a completed reminder pending again;
- reschedule by 1, 7, or 30 days;
- delete a reminder.

The app prevents invalid or already-elapsed reminder dates from being saved.

---

## 18. Care calendar

The **Care calendar** organizes personal reminders across registered pets.

It can:

- show a monthly calendar;
- indicate dates containing care items;
- filter the calendar by pet;
- open the items for a selected date;
- create a new reminder directly from the calendar;
- preserve the chosen pet and exact date/time when saving.

---

## 19. Profile

The Profile screen shows basic account information such as:

- display name;
- account email;
- contact number;
- number of registered pets.

It also links to:

- Pets;
- Privacy & preferences;
- Notifications;
- Log out.

---

## 20. Privacy controls

PetConnect gives the owner recovery-specific privacy controls.

### Show recovery phone

When enabled, the owner's phone number can be shown to people who open a valid recovery tag.

When disabled, the public recovery profile does not expose the recovery phone number.

### Share exact lost-pet location

When enabled, the active lost report can expose the exact recovery map point.

When disabled, PetConnect reduces the precision of public recovery coordinates rather than publishing the owner's exact point.

### Information that remains private

The public recovery profile does not expose the pet's actual microchip number.

---

## 21. Camera, location, and notification permissions

Some features need device permissions.

### Camera

Used for:

- scanning PetConnect QR tags;
- taking finder evidence photos.

### Location

Used for:

- setting a lost pet's last-known location;
- finding nearby lost reports;
- attaching a current finder location to a sighting.

If finder GPS is unavailable, the finder can still type a nearby street, landmark, or area.

### Notifications

Used for recovery and reminder updates on supported mobile builds.

---

## 22. Common recovery scenarios

### Scenario A — A finder scans the pet's tag

1. Finder scans the QR.
2. Public recovery profile opens.
3. Finder sees whether the pet is reported lost.
4. Finder chooses **I have this pet** or **I saw this pet**.
5. Finder supplies the required location and evidence.
6. PetConnect sends the report to the owner's recovery case.
7. Owner reviews the finder report and recovery trail.
8. Owner marks the pet **Reunited** after recovery.

### Scenario B — The tag cannot be scanned

1. Finder opens **Scan**.
2. Finder enters the printed PetConnect short code.
3. PetConnect resolves the code and opens the same recovery flow.

### Scenario C — The pet has no visible tag

1. Finder opens **Can't scan a tag?**
2. Finder adds species/breed/appearance clues.
3. PetConnect searches nearby active lost reports.
4. Finder opens the closest likely match.
5. Finder submits a sighting.

### Scenario D — The owner loses a printed tag

1. Owner opens the pet's **Pet ID**.
2. Owner manages the affected recovery tag.
3. Owner chooses **Replace**, **Mark lost**, or **Disable**.
4. Owner creates or prints a new active tag if needed.

---

## 23. Feature summary

The current owner/finder PetConnect experience includes:

- account creation and sign-in;
- password reset;
- session protection and logout;
- pet CRUD;
- pet photo upload and optimization;
- generated Pet IDs;
- multiple QR recovery tags per pet;
- printable/shareable QR recovery cards;
- recovery short codes;
- recovery-tag replacement, lost, and revoke lifecycle;
- QR scanning;
- short-code lookup;
- no-tag nearby pet matching;
- public recovery-safe pet profiles;
- finder evidence photos;
- finder GPS or text location;
- optional finder contact sharing;
- phone verification when required;
- lost-pet reporting;
- nearby recovery feed;
- owner recovery cases;
- sightings and recovery timelines;
- recovery map trails;
- finder report review;
- abuse reporting;
- lost-pet poster sharing/printing;
- LOST → SIGHTED → REUNITED recovery status;
- push and in-app notifications;
- personal care reminders;
- care calendar;
- owner privacy controls;
- profile and account summary.
