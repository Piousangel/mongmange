# Privacy Policy — [English app name — set after the name test]

- Version: v3.2 draft (2026-11-25 — v3.1 (2026-11-24: legal first-pass review edits P1–P19, owner and PM decisions, concept v3 (D-26) and the independent review) aligned on 2026-11-25: app update checks, the 2-year inactivity clean-up, care routines (meals, treats, stroll); **written as of launch**)
- Effective date: [Effective date — owner to fill]
- Operator: [Operator — owner to fill]
- Contact: hello@mongmang.ink

> **Remove before publishing — internal implementation checklist.** This version describes, as launch behavior, several things not built yet (ML Kit handwriting recognition, zero trace of crisis words, the "one stroke + category" Keep it safe upload, opt-in usage statistics behind the age check, meals, treats, the meal reminder and the on-screen stroll). Check every line against code, tests and evidence before RC using the checklist **K1–K35** at the top of `privacy-policy.ko.md` (one table for both languages). If code and policy differ, fix one of them before publishing. v3.2 (2026-11-25): our own update server and the in-app update check (V21, V24) and the 2-year inactivity clean-up (V25) are committed (K7, K8, K20, K27); D-27 care routines added as K33–K35; usage statistics (K1, K3, K25) are to be checked after the B4 commit. The real-steps update (planned for 01-26) is listed separately in the Korean file under "01-26 업데이트 전 개정 목록".

This policy explains how [Operator — owner to fill] ("we") handles personal information in the mobile game [English app name] (Korean title: 몽망이 키우기, the "App") and on the shared-link web pages at `mongmang.ink` (the "Web Pages").

## 1. At a glance

- **The game runs fully on your device without our server.** The original copy of your game record lives on your device.
- There is no sign-in screen. We do not ask for your name, email, phone number, advertising ID, location, contacts, or photos. There are no ads, no tracking, and no purchases.
- **The "word of the day" you write with the brush is read only on your device.** Unless you turn on "Keep it safe", we do not receive your handwriting or its category; even then, we keep only the single stroke that became part of your Mongmangi's body each day and the word's category (sections 2 and 3-5).
- Only the following reaches a server:
  1. **Everyone**: app update checks (our own server), downloads of settings/content files and of the handwriting recognition model, and diagnostic data that the handwriting recognition feature sends to Google → sections 3-2 and 3-3
  2. **If you pass the age check and turn on "Send usage statistics" yourself**: usage statistics with no account or device identifiers. **Off by default** → section 3-1
  3. **If you turn on "Share by link"**: a copy of your Mongmangi for its public page → section 3-4 and section 5
  4. **If you turn on "Keep it safe" (cloud backup)**: your game record (for your handwriting, only one stroke per day and the word's category) → section 3-5
- Before you turn on 2, 3 or 4, we check once that you are 14 or older. An anonymous account is created only the first time you turn on 3 or 4 (section 4).
- You can delete what you left on our server at any time from inside the App (section 12).

## 2. Information stored only on your device

The following is stored on your device. It is not sent to us unless you turn on "Keep it safe".

| Stored on your device | Why |
|---|---|
| **Word of the day**: the stroke coordinates of the word you wrote with the brush (including timing), the category the word falls into and its strength, and the dictionary version. **We do not store the recognized letters or any letters you type on the keyboard (as text).** If you turn on Keep it safe, we keep only the coordinates of the single stroke that became part of your Mongmangi's body each day and the word's category (3-5); the rest of your handwriting stays on your device | To decide your Mongmangi's gestures, body and dreams, and to redraw past handwriting in the Studio Notebook |
| Coordinates, timing and pressure of the strokes you draw; how much ink you ground on the inkstone | To draw your Mongmangi's body and growth |
| Your sleep and morning times, when your Mongmangi slept and woke, and your device time zone | To work out each "day" (one sleep) |
| Game progress (temperament, stroke count, body habits formed from the categories of your words, morning card history, your Mongmangi's name and ink, days together, favorite petting spots) | So you can continue where you left off |
| **Usual visit hours** (which hours of the day you open the App), **time away** (latest and longest), last visit time, install time | So your Mongmangi can seem to recognize you |
| **Meals and treats**: how many spoonfuls you gave during the current waking (from waking up to the next sleep; reset to 0 when a new waking starts), and which kinds of meals and treats you have unlocked. **We do not store when or how many times you fed your Mongmangi** | For the game progress of caring for your Mongmangi |
| **Stroll day mark**: whether you walked with your Mongmangi on the screen during that waking (a single yes/no). It is deleted after it is used for the next morning's scene, and it is not uploaded by Keep it safe (3-5) | To decide your Mongmangi's gestures and dreams the next morning |
| Settings (notifications, meal reminder, sound, reduced motion, sending usage statistics, etc.) | To keep your preferences |
| Design test group (A or B, picked at random when you install) | For a test of the naming screen. It stays on your device even if usage statistics are off |
| Usage statistics waiting to be sent (up to 7 days' worth) and a record of game events already sent | If usage statistics are on: to send them together after a lost connection, and so the same event is not counted twice. Turning them off deletes what is waiting |
| Age check result (if you pass: the version of the check and the date; if you are under 14: only "under age" and the date. Your birth year and month are not stored) | To unlock usage statistics and account features, and so we do not ask again the same day |

- Device tilt is used in the moment to make your Mongmangi glance around. It is not stored.
- The home screen widget only uses pictures stored on your device and sends nothing to any server.
- **The on-screen stroll** uses only your finger's movement on the screen. It does not read step counts, motion sensors, location or health data, and it does not ask for any permission.
- If we add a feature that remembers words not in the dictionary ("familiar words"), that memory will stay in separate on-device storage and will not go into device backups, Keep it safe, or any server. Before adding it, we will describe in this policy what is stored and let you know in the App.
- **Words Mongmangi stays close for**: for some words, Mongmangi comes close and breathes with you, and sometimes leaves a note with places where you can talk to someone. 'Someone to talk to' is always in your notebook regardless. On days when such words are written, the handwriting is erased before saving, except the single stroke that becomes part of Mongmangi's body, and the word's category is saved as an ordinary value. No record that you wrote such a word remains on your device, in backups, or in "Keep it safe" storage, and we cannot know it either. Your device keyboard's own learning follows that keyboard's settings. Mongmangi is not a substitute for support from people.

## 3. Information sent to a server

### 3-1. Usage statistics (only if you pass the age check and turn them on yourself; off by default)
- **Off by default.** "Send usage statistics" is shown only to people who have passed the age check (section 4), and we send statistics only if you turn it on yourself. Children under 14 cannot turn it on. [Check against the B4 commit — align the items, event count and sending method in this section with the B4 implementation, then remove this mark]
- **What** (dates only; we never send times of day):
  - install date (by your device's calendar) and **the days you open the App** (once a day, as the number of days since install)
  - platform (iOS or Android), app release (for example 1.0 — no detailed build number), language
  - design test group (A or B), whether a home screen widget was in use on day 7 ("unknown" before day 7 or if it cannot be checked), whether the day is around a full moon
  - whether 10 fixed game events happened (first touch, first night, day seven, naming, choosing an ink, opening, link and image sharing, turning on Keep it safe, restoring a record) **and the day each happened** (days since install). For events that can repeat, such as sharing, we also count how many times
  - your words, their categories and your handwriting are never part of usage statistics
- **No identifiers**: we attach no account or device identifier; the server only adds up counts for each combination. The statistics contain no value showing who sent them, although the IP address used for the connection stays briefly in access logs as described below.
- **When few people use the App**: early on, some combinations may contain only one person. So the tables we look at hide any cell **with a count below 5**, we never export the raw count table, and we do not look at the raw table during closed testing. Repeatable events such as sharing can be counted several times for one person, so a cell with a count of 5 or more may still contain only one person.
- **Why, and legal basis**: to measure how many people keep playing and to improve the game (you turn it on yourself — consent, Article 15(1)1 of Korea's Personal Information Protection Act). [Legal review: legal basis]
- **Turn on or off**: Studio Notebook > Settings > "Send usage statistics". Once off, nothing more is sent, and statistics waiting on your device are deleted.
- **How it is sent**: if there is no connection, up to 7 days' worth is kept on your device and sent together later; anything older than 7 days is deleted unsent (section 2).
- **IP address**: your IP address reaches the server as part of the connection.
  - To block excessive requests, the server uses your IP address (for IPv6, the first 64 bits) in memory **for about one minute** only to count requests, and does not store it.
  - Our own server records (app logs) do not include IP addresses.
  - The cloud provider's access logs record the IP address, request path and time, and are deleted after **7 days** (sections 6 and 8).
  - We do not store IP addresses in our database together with these statistics.

### 3-2. App update checks (everyone)
- To ship bug fixes quickly, the App asks **our own update server** (Google Cloud Run, Seoul region, Republic of Korea) whether a new version exists, **once a day by your device's calendar, starting from the second launch**. It does not ask on first launch. No outside update delivery service is involved. Requests pass through Google's web delivery service (Firebase Hosting, a worldwide network) before reaching the server in Seoul (sections 7 and 8).
- **Exceptions**: if the App stops with an error right after starting (including on first launch), the update component checks once for a fixed version; and if the App ends abnormally twice in a row, it skips the once-a-day limit and asks right away. This is to get bug fixes to you quickly; the request carries the same values listed below.
- **What the request carries**: platform, app runtime version and update channel, the identifiers of the update currently in use and of the update built into the App (the same values for everyone on the same version), your IP address, and basic connection information such as the User-Agent.
- **What is not sent**: the App's update component (expo-updates) is designed to add, as standard, a random identifier created for each installation, the identifiers of failed updates and the error message that stopped the App. This App **replaces these with the same fixed value (or an empty value) for every user.** So an update check cannot tell installations or devices apart, and error messages do not reach us.
- **What we do with it**: we use only the values needed to pick the right update (platform, runtime version, channel and current update identifier), in the moment, and we do not keep them in our database or in our server records (app logs).
- Update files are downloaded the same way (through Firebase Hosting to our server). A downloaded update is applied the next time the App starts fresh; it never changes while you are using the App.
- On your device, the App notes only when it first and last checked for updates, whether it was closed normally, and how many times in a row it ended abnormally — no identifiers, and none of this is sent to a server.
- To block excessive requests, the server uses your IP address (for IPv6, the first 64 bits) in memory for about one minute only to count requests, and does not store it. As in 3-1, your IP address stays in the cloud provider's access logs for 7 days. [To verify: what the platform records for requests through Firebase Hosting and for how long — this line and sections 6 and 8 will be updated after the B6 measurement]

### 3-3. Settings and content files, and the handwriting recognition model (everyone)
- The App downloads feature on/off settings and new dream picture files from a web host (Google Firebase Hosting). Your IP address is used to serve these requests. We do not log them.
- **Handwriting recognition**: your word of the day is read **on your device** by Google's ML Kit Digital Ink Recognition. The first time you write, the App downloads a recognition model for your language (about 20 MB) from Google's servers, which uses your IP address. **Your handwriting (strokes) and the recognition result are not sent to Google or to us.** If the model cannot be downloaded, you can type instead.
- **ML Kit diagnostic data**: while it works, the handwriting recognition feature sends Google the following — device information (manufacturer, model, operating system version and build, available ML hardware accelerators), app information (package name and app version), per-installation identifiers, performance metrics (such as latency), feature configuration, the configured recognition language, input and output size, feature version, event type, and error codes. Google uses this data for ML Kit diagnostics and usage analytics. We do not receive or see it. Details are in Google's ML Kit data disclosure (https://developers.google.com/ml-kit/android-data-disclosure).

### 3-4. If you turn on "Share by link"
- **What**:
  - A random anonymous account identifier, a record that you passed the age check (version of the check and the date — your birth year and month are not sent), and the month you last used it
  - Sign-in session records: the anonymous account service (Supabase) may record the IP address, browser information (User-Agent) and time while managing sessions [To verify: whether recorded, how to turn off, retention — this line and sections 6 and 8 will be updated after measurement]
  - The public page copy: simplified lines of your strokes, a summary of your Mongmangi's inborn shape, its ink and grain name, its birth date, the number of days together on the day you turned the link on, language, and its name (**only if you turn on name visibility**)
  - Public images and an 8-second video made by the App (the name appears in the image only if name visibility is on)
- **Never in the public copy**: your handwriting and words, word categories, and scenes or text that reveal how you felt on a given day (dream captions that change with that day's word, scenes of Mongmangi answering your word). Grain names that describe feelings are not used. Body habits built up over the 28 nights (comb posture, ink tint) are part of how your Mongmangi looks, so they do show in images and video.
- When you create or recover an account, to limit excessive attempts we count your IP address (for IPv6, the first 64 bits) in server memory for up to one day, without storing it.
- **Why, and legal basis**: to provide the feature you turned on (the shared-link web page) — performance of our agreement with you (Article 15(1)4 of Korea's Personal Information Protection Act). See section 5 for what is public.
- **Not sent**: stroke timing and pressure, usual visit hours, time away, visit times, device information such as model or operating system, location.

### 3-5. If you turn on "Keep it safe" (cloud backup)
- **What**: the account items in 3-4, plus **your game record**, which contains:
  - **Word of the day**: for each day, we keep only the single stroke that became part of Mongmangi's body and the word's category. The rest of your handwriting stays on your device, so if you restore on another device, Mongmangi's body and dreams return as they were, but your past handwriting does not. Every day is uploaded in the same shape, so no day can be told apart by what was written
  - Coordinates, timing and pressure of your strokes
  - Sleep and morning time settings, when your Mongmangi slept and woke, device time zone
  - Game progress (including body habits formed from your word categories, meal and treat records, and the meal reminder setting) and your Mongmangi's name. The stroll day mark is not uploaded
  - **Usual visit hours** (which hours of the day you open the App), **time away** (latest and longest), **last visit time**, **install time**
- Sent along with each upload: the time it was saved on the device and a checksum (hash) of the record. **We do not send any value that tells devices apart (no device identifier or random device value).**
- The "recovery phrase" you use to move to a new device is stored on our server **only as a hash**.
- Taken together, these values could suggest **your daily rhythm** — when you open the App and how long you stay away — and **what kinds of words you often wrote**. We keep them only inside your game record; we do not extract, search, or view them separately, and they never go on a public page.
- **Why, and legal basis**: so you do not lose your Mongmangi when you change devices or delete the App — providing the feature you turned on (performance of our agreement, Article 15(1)4 of Korea's Personal Information Protection Act).

### 3-6. Visitors to shared-link web pages
- When a page opens, we count **one page load**. No cookies or identifiers are used, and this count does not store your IP address.
- We do not collect our own request logs for these pages, so IP addresses and link addresses are not logged together. To limit excessive requests, we use your IP address (for IPv6, the first 64 bits) only in server memory without storing it, and clear it from memory after about one minute for page requests and up to one hour for report counts. Processing by the web delivery provider (Google Firebase Hosting) is described in section 8.
- If you **report** a page, we keep **a pseudonymized value derived from your IP address (this is personal information)** **for up to 7 days per reported page** to tell repeat reports from the same person, then delete it. We do not store information that directly identifies the reporter.
  - A report is one choice from a fixed list of reasons; there is no box for writing text.
  - The pseudonymized value mixes your IP address (for IPv6, the first 48 bits) with **a random value that is different for each reported page** and cannot be turned back, so reports on different pages cannot be linked. When the page is hidden or 7 days pass, it is deleted together with that random value.

### 3-7. Send feedback
- "Send feedback" in the Studio Notebook only opens a web survey outside the App. The App does not attach your game record or any device information. Anything you type into the survey is handled under that survey service's policy, and we use it only to improve the game. [Survey tool name and policy link — to fill once chosen, and add rows to sections 7 and 8]

## 4. Age check and children under 14

- **Features that create an account are only for people aged 14 and older.** Anyone can play the on-device game. The App is not directed at children and does not take part in children's categories.
- Before you first turn on "Send usage statistics" or a feature that creates an account ("Share by link", "Keep it safe", or the later "Night Water"), we ask once for your **birth year and month**. The check runs on your device, and **your birth year and month are not stored on your device or our server**.
- If you are under 14, no account is created, and the feature and usage statistics stay off. Your device keeps only "under age" and the date so we do not ask again the same day. You can keep playing on your device and saving or sharing cards.
- We do not offer a parental consent process and do not create accounts for children under 14. The information in sections 3-2 and 3-3 (update checks, file and model downloads, handwriting recognition diagnostics) is needed for the App to work and is sent from every user without an age check. Only people who have passed the age check can turn on the usage statistics in 3-1. [To be revised after legal review]
- If we learn that a child under 14's information has been processed on our server, we will delete it without delay. We take the public page down as soon as we confirm, and, so that a mistaken request cannot erase someone else's records, we notify the account in the App and delete what is kept on our server **72 hours** later. Parents or guardians can contact us at the address in section 17. [Legal review: how to verify a guardian]

## 5. What is public on a shared-link page

- "Share by link" is **off by default**. Only when you turn it on is a page published at `https://mongmang.ink/m/(8-character code)`. Anyone with the link can see it.
- The page shows only the public copy in 3-4, **fixed at the moment you turn the link on (or tap "Make it again")**. It does not change daily, so people with the link cannot learn your visiting rhythm.
- Your handwriting and words, and scenes that reveal how you felt on a given day, are never shown (3-4). Body habits built up over time are visible.
- **Name visibility is off by default.** Even when on, names caught by our word filter or that look like contact details (7 or more digits in a row) are not shown; the page uses the App's name instead. Please do not use a real name or contact details as your Mongmangi's name.
- Pages are set not to be indexed by search engines, and we offer no list of public pages.
- **Turning it off**: the link stops at once in the App and on our server; because of caching, the web page disappears **within 1 hour**, and the public files are deleted. We cannot remove copies others have already downloaded or link preview cards already posted in messaging apps.
- If three different people report a page, it may be hidden automatically (we turn this automatic hiding on or off depending on operations, and there is a cap on how many pages can be hidden automatically per hour — section 12-1). If it is hidden, we review it within 7 days to restore or remove it. If no decision is made within 30 days, it is shown again (or deleted if you turned the link off in the meantime). After review, we may keep the page but **hide only the name**; only we can show a hidden name again.

## 6. Retention and deletion

| Item | Kept for |
|---|---|
| Current game record (Keep it safe) | Until you delete your account |
| Earlier copies of the game record (for undo) | Latest 3 + one per week, **up to 4 weeks**; conflict and pre-restore copies 30 days |
| Public page copy, images, video | While the link is on (deleted when turned off; web cache up to 1 hour) |
| Public pages hidden after reports | Up to 30 days (restored or removed after review; restored if no decision within 30 days) |
| Recovery phrase | Hash only, until you delete your account (replaced with a new phrase after each recovery) |
| Old account after recovery to another device | **30 days** (the old device can no longer use the server), then deleted |
| Public images or video whose upload did not finish | Deleted after 6 hours |
| Sign-in session records (3-4) | [To verify: whether recorded and retention] |
| Age check pass record | Until you delete your account |
| Link page load counts | After 30 days, rolled into totals without the link code |
| Usage statistics (no identifiers) | After 90 days, rolled into monthly totals (dropping the date, full-moon and widget details) |
| Values in update checks (3-2) | Not stored. The installation identifier, failed update data and error messages are replaced with fixed values by the App, so they never reach us |
| Cloud access logs (IP address, request path, time) | 7 days. Our own server records (app logs) contain no IP addresses |
| Report records | 1 year (to spot repeat problems with the same page). Reporters' pseudonymized values up to 7 days per reported page |
| Deletion receipt (one-way value) | 24 hours |
| Copies in database backups | Expire after 7 days. Until then, used only to restore the server |
| Emails with questions or requests | Deleted within **1 year** after the request is handled (kept only in the operator's mailbox, not on our server) |
| **Inactive accounts** | If there is **no request using a server feature for 2 years** (saving to Keep it safe, or account requests such as turning the link on or off or making it again), we delete everything you left on our server (account, game record, earlier copies, public page and its files, link statistics, age check record — the same as when you delete your account). Time when you only open the App without using server features also counts as inactive. Other people viewing your shared-link page does not count as use. We record only the **months** (in Coordinated Universal Time) in which an account request was made, and we never delete before a full 2 years have passed since the last month of use. The clean-up runs a little each day with a daily cap, and it stops for the operator to check if an unusually large number of accounts become due at once or the server clock looks wrong — so deletion can come later than 2 years, but never earlier. We have no way to contact you, so this policy is our advance notice |

- **How we delete**: electronic files are deleted so they cannot be recovered. Deleting your account removes the game record, earlier copies, public page, link statistics, and age check record together; copies in backups expire after 7 days. So that a deleted account does not come back if we ever have to restore the server from a backup, we keep one irreversible value (a one-way hash) that points to the deleted account for the same 7 days as the backups, delete the account again right after any restore, and then delete that value too.
- Your on-device game record is deleted when you uninstall the App.

## 7. Service providers (processors)

We use the following providers to run the service, under each provider's data processing agreement (DPA). [Legal review: whether accepting the standard DPAs satisfies the written-contract requirement]

| Provider | Task |
|---|---|
| Supabase, Inc. | Database, anonymous account authentication, public file storage |
| Google LLC (Google Cloud Run, Cloud Logging, Cloud Scheduler) | Running the server (including app update checks), keeping request logs, running scheduled clean-up jobs |
| Google LLC (Firebase Hosting) | Delivering web pages and settings/content files; passing app update checks and update files to and from our server |
| Cloudflare, Inc. (Email Routing) | Forwarding emails sent to hello@mongmang.ink to the operator's mailbox (content is not stored) |
| Google LLC (Gmail) | Keeping question and request emails (the operator's mailbox) |
| [Add if adopted: Cloudflare, Inc. — web page front end (Worker) and large web file delivery (R2). This policy will be updated before adoption] | |

## 8. International transfers

Our data is stored in the Seoul (Republic of Korea) region, but because the providers below are foreign companies or use servers abroad, we disclose them as international transfers. These transfers are outsourcing and storage needed to perform our agreement with you, made after disclosing the items below, under Article 28-8(1)3 of Korea's Personal Information Protection Act. [Legal review: whether Article 28-8(1)3 (outsourcing and storage) fits ML Kit diagnostics, which Google also uses for its own purposes]

| Recipient (contact) | Country | Items | When and how | Purpose | Retention |
|---|---|---|---|---|---|
| Supabase, Inc. (privacy@supabase.com) | United States (company). Stored in the Seoul region; remote access for operations is possible | Items in 3-4 and 3-5 | From when you turn on "Share by link" or "Keep it safe", as you use them; encrypted (TLS) | Storage and authentication | As in section 6 |
| Google LLC (https://support.google.com/policies?p=privpol_privts) — Cloud Run, Cloud Logging, Cloud Scheduler | United States (company). Processed and stored in the Seoul region (requests arrive through Google's worldwide network) | Request data (IP, request path, request time) and what is sent under 3-1, 3-2, 3-4 and 3-5 | While you use the App; TLS | Running the server, logs | Logs 7 days |
| Google LLC (https://support.google.com/policies?p=privpol_privts) — Firebase Hosting | Countries near where you connect (worldwide delivery network) | IP address, public page content, app update checks (3-2) and update files | On file and page requests and update checks; TLS | Delivering web pages and files, passing on update requests | No logs kept by us; per Google's policy |
| Google LLC (https://support.google.com/policies?p=privpol_privts) — ML Kit (handwriting recognition) | United States (company) | Diagnostic data in 3-3, IP address when downloading the model | When the recognition model is downloaded and while recognition runs; TLS | Model delivery, ML Kit diagnostics and usage analytics | Per Google's policy |
| Cloudflare, Inc. (privacyquestions@cloudflare.com) — Email Routing | United States | Sender's email address, the email (forwarded only; content not stored) | When you email us; TLS | Forwarding to the operator's mailbox | Content not stored; forwarding records per Cloudflare's policy |
| Google LLC (https://support.google.com/policies?p=privpol_privts) — Gmail | United States (company) | Email address, message content | When you email us; TLS | Handling your request | 1 year after handling |
| [Add if adopted: Cloudflare, Inc. (United States) — web page visitors' IP addresses, public content] | | | | | |

- **How to refuse**: do not turn on "Share by link" or "Keep it safe", or turn them off and delete what is on our server (section 12). Usage statistics are not sent unless you turn them on. Update checks, file and model downloads and handwriting recognition diagnostics are needed for the App to work and cannot be refused separately.
- **What happens if you refuse**: without the link or Keep it safe, no account data is transferred and the on-device game keeps working. Without the link there is no shared web page; without Keep it safe you cannot move your record with a recovery phrase when you change devices (device backup and export codes still work).

## 9. Disclosure to third parties

We do not provide your personal information to third parties. A shared-link page is public because you chose to turn it on (section 5). However, where a law specifically requires it, or where investigative or other authorities request it following the procedures set by law, we may provide the minimum necessary under Article 18(2) of Korea's Personal Information Protection Act.

- ML Kit diagnostic data (3-3) is sent directly to Google by the Google ML Kit component inside the App; it is not data we receive and pass on. [Legal review: whether to describe this as outsourcing or as provision to a third party]

## 10. Device backup and export

- If device backup is on (iCloud Backup on iOS, Auto Backup on Android), your game record may be included in **your own Apple or Google account backup**. That backup is handled under Apple's or Google's terms; we have no access to it. Your server sign-in session is excluded from backups.
- A save export code is something you copy and keep yourself. It is not sent to us.

## 11. Notifications, saving and sharing cards

- The App uses **local notifications scheduled on your device only**. We do not collect push tokens. You choose whether to allow notifications when first asked, and you can turn them off anytime in your device settings.
- **Meal reminder** (optional, **off by default**): if you turn it on, when you close the App it schedules **just one** notification on your device — an observation that your Mongmangi is looking toward the inkstone. If you wrote a word during that waking, it comes in the waking after next; if you did not, it comes in the next waking. What you wrote makes no difference. Opening the App cancels every scheduled reminder. No record of scheduling or sending is kept, and nothing about it goes to our server or into usage statistics. You can choose it when we first ask for notification permission, and later turn it on or off in the Studio Notebook. Your Mongmangi grows the same whether or not you turn it on.
- A morning card is saved or shared **only when you tap to do so**, through your device's standard share sheet to the app you choose; we do not receive it. Saving to your photo library may ask for add-only access; the App does not read your existing photos.

## 12. Your rights and how to use them

You may ask to access, correct, delete, or stop the processing of your personal information at any time.

| To do this | How |
|---|---|
| Delete everything on our server | In the App: Studio Notebook > "Delete what's kept on the server" (processed right away) |
| Delete without the App | Web deletion page `https://mongmang.ink/delete` — processed right away **when both your share link code and your recovery phrase match**. Accounts are anonymous, so the phrase is our only way to confirm it is you. To limit excessive attempts, we count your IP address (for IPv6, the first 64 bits) in server memory for up to one hour, without storing it |
| Stop a public page | Turn off "Share by link" in the App |
| Hide only the name | Turn off name visibility in the App and tap "Make it again" |
| Stop usage statistics | Turn off "Send usage statistics" in Settings |
| Delete on-device data | Uninstall the App |
| Access, correction, other requests | Email in section 17 |

- **How we handle email requests**: emails and messages are **read only by the operator (a person) and are not passed to AI tools.** Accounts are anonymous, so an email address alone cannot show that a request comes from you. For deletion, we point you to in-App deletion or the web deletion page. **Please do not put your recovery phrase in an email** — it would then remain in our mailbox and with our email provider. How we confirm your identity for other requests: [to fill after legal review]
- If you have lost your recovery phrase and uninstalled the App, we may have no way to confirm your identity and may be unable to act on a request; this protects you from someone else deleting your record. In that case, what you left on our server will be deleted by the 2-year inactivity rule in section 6.

### 12-1. Automated decisions

Two decisions are applied automatically by the system before a person reviews them.

| Decision | Rule | Explanation and objection |
|---|---|---|
| Automatic hiding of a public page | If three different people (by pseudonymized IP value, within 7 days) report a page, it is hidden. We turn this on or off depending on operations, and there is a service-wide cap on automatic hides per hour | We review within 7 days to restore or remove; if no decision within 30 days, the page is restored. You can ask for an explanation or object by email (section 17) |
| Name automatically not shown | Even with name visibility on, a name caught by our word filter or with 7 or more digits in a row is not shown | You can ask for an explanation or object by email (section 17); the operator reviews and replies |

- Mongmangi's gestures in answer to your words, and staying close (section 2), are game behavior on your device, not decisions we make about you.
- [Legal review: whether these are "automated decisions" under Article 37-2 of Korea's Personal Information Protection Act]

## 13. Cookies and tracking

- The App and Web Pages use no cookies or similar tracking technologies. The page load signal on Web Pages (3-6) only adds to a count, with no cookies or identifiers.
- We do not link data with other companies' apps or websites to track you, and we do not show targeted ads.

## 14. Security

- All server traffic is encrypted (TLS). The App's server, which handles your game record and sign-in data, runs in the Seoul region; requests and public image/video uploads arrive through our providers' (Google's and Supabase's) networks (sections 7 and 8).
- Recovery phrases are stored only as hashes, and share link codes are hard-to-guess random values.
- The server does not extract any value from your game record other than day count, stroke count and version, and there is no admin screen for viewing game records.
- Only values checked against an allow-list by the server go on a public page.
- Server logs do not contain sign-in tokens, recovery phrases, game record contents, or the values in update checks. Recognized letters are not written to logs on your device either.
- Administrative access to the server and database is limited to the operator alone, with two-factor authentication on admin accounts.
- On your device, the game record is kept in app-private storage (an area the operating system protects from other apps).
- **Breaches**: if we learn that personal information has been, or may have been, leaked, we will tell you through an in-App notice and a notice on this page within the time limits set by law, and report to the relevant authorities. Anonymous accounts have no contact details, so we use these notices instead of individual messages.

## 15. If the service ends

If we ever shut down the server, we will tell you in the App and on this page **90 days in advance** and let you download what you kept on the server during that time. The on-device game keeps working without the server. After shutdown, all server data is deleted.

## 16. When data handling changes

- If we add a new kind of data processing, such as crash reporting, we will update this policy before that version is released — saying what is sent and where — and let you know in the App.
- If we ever add a feature that interprets your words on our server, we will **ask for your separate consent** before turning it on. You can keep playing the game as it is today without consenting.

## 17. Contact and privacy officer

| | |
|---|---|
| Privacy officer | [Operator — owner to fill] |
| Role | Operator (solo developer) |
| Email | hello@mongmang.ink |
| Phone | [Operator — owner to fill; e.g. a relay number, whether to list one depends on legal review] |

The operator is also the **Privacy Officer** (New Zealand), the **person in charge of the protection of personal information** (Québec) and the **Data Protection Officer** (Philippines). Requests for access or deletion and complaints are handled at the contacts above. Emails we receive (your email address and message) are read only by the operator, used only to handle your request, and deleted within the period in section 6 (1 year after handling). [Legal review: whether email alone is enough as the privacy officer's contact]

## 18. Country-specific information

You can use the rights in section 12 wherever you live. If you are not satisfied with our answer, you can also contact the privacy authority where you live. [Check every contact on the official site before publishing]

### Republic of Korea
- Personal Information Dispute Mediation Committee: 1833-6972, www.kopico.go.kr
- Personal Information Infringement Report Center (KISA): 118, privacy.kisa.or.kr
- Supreme Prosecutors' Office: 1301 / Korean National Police Agency cyber bureau: 182

### Canada
- Our person in charge of privacy is named in section 17 (title: Operator; email hello@mongmang.ink). You can complain to the **Office of the Privacy Commissioner of Canada** (www.priv.gc.ca).
- **Québec**: the person in charge of the protection of personal information is the operator (section 17). We assess privacy factors (a privacy impact assessment) before your information is communicated outside Québec (to the Republic of Korea and the United States, as listed in sections 7 and 8). Usage statistics, Share by link, name visibility and Keep it safe are all off by default. You can complain to the **Commission d'accès à l'information du Québec** (www.cai.gouv.qc.ca).

### New Zealand
- Our Privacy Officer is the operator (section 17). You can complain to the **Office of the Privacy Commissioner** (www.privacy.org.nz). If a privacy breach is likely to cause serious harm, we will notify the Privacy Commissioner and affected people as soon as practicable.

### Philippines
- Our Data Protection Officer is the operator (section 17). You can complain to the **National Privacy Commission** (www.privacy.gov.ph).

## 19. Changes to this policy

We will post any change on this page and in the App before it takes effect, and keep earlier versions available on this page.

This policy exists in Korean and English. If they differ, **the Korean version prevails for users in the Republic of Korea**, and the English version prevails for everyone else.

### Version history

| Version | Date | Changes |
|---|---|---|
| v1 | Not published | First version (no server, no collection). Pre-publication change (2026-11-20): added the name, ink and relationship values (stored on device) and the "Send feedback" web survey line |
| v2 | Not published (draft 2026-11-20) | Reflected the new server: usage statistics, app update checks, settings file requests (3-1 to 3-3); anonymous account and data for "Share by link" and "Keep it safe" (3-4, 3-5); Web Page visitors and pseudonymous report values (3-6); age check (4); what is public (5); retention (6); processors (7) and international transfers (8); your rights (12); service-end promise (15) |
| **v3** | [Effective date — owner to fill] (draft 2026-11-24; v3.1 the same day after independent review: statistics only if turned on by people who passed the age check, Keep it safe = one stroke per day + category, 2-year inactivity rule, email route, 1-year retention and no AI tools, automated decisions (12-1), "count below 5" cells, automatic hiding "may", 24-hour deletion receipt; v3.2 2026-11-25: update checks **do not send** installation identifiers, failed update data or error messages, exceptions to the check timing, and routing through Firebase Hosting (3-2, 6, 7, 8, 14); the month-based rule, daily cap and safety stops of the inactivity clean-up (6); meals, treats and the stroll day mark (2, 3-5) and the meal reminder (11)) | Legal first-pass review applied: word of the day (handwriting and word categories) and zero trace of crisis words (1, 2); usage statistics **off by default**, legal basis and protections while few people use the App (3-1); app updates moved to **our own server**, installation identifiers not stored (3-2); ML Kit handwriting model and diagnostics (3-3, 8, 9); performance-of-agreement basis (3-4, 3-5); what never goes in the public copy (3-4, 5); Keep it safe uploads handwriting only in unreadable form (3-5); report values described as pseudonymized personal information (3-6); age for account features (4); limits on backup copies and email retention (6); DPAs (7); transfer basis, contacts, how to refuse and its effect (8); legal-request exception (9); handling email requests (12); breaches (14); separate consent before any server-side interpretation (16); privacy officer contacts (17); country-specific information for Korea, Canada/Québec, New Zealand and the Philippines (18); which language prevails (19). Removed the Expo (650 Industries) processor and transfer rows |
