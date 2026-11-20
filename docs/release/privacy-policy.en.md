# Privacy Policy — [English app name — set after the name test]

- Version: v2 (draft reflecting the new server; independent review of 2026-11-20 applied)
- Effective date: [Effective date — owner to fill]
- Operator: [Operator's legal name — owner to fill]
- Contact: [Contact email — owner to fill]

This policy explains how [Operator's legal name — owner to fill] ("we") handles personal information in the mobile game [English app name] (Korean title: 몽망이 키우기, the "App") and on the shared-link web pages at `mongmang.ink` (the "Web Pages").

## 1. At a glance

- **The game runs fully on your device without our server.** The original copy of your game record lives on your device.
- There is no sign-in screen. We do not ask for your name, email, phone number, advertising ID, location, contacts, or photos. There are no ads, no tracking, and no purchases.
- Only the following reaches a server:
  1. **Everyone**: usage statistics with no account or device identifiers (you can turn them off), app update checks, and settings/content file requests → sections 3-1 to 3-3
  2. **If you turn on "Share by link"**: a copy of your Mongmangi for its public page → section 3-4 and section 5
  3. **If you turn on "Keep it safe" (cloud backup)**: your whole game record → section 3-5
- An anonymous account is created only the first time you turn on 2 or 3, and we check that you are 14 or older right before that (section 4).
- You can delete what you left on our server at any time from inside the App (section 12).

## 2. Information stored only on your device

The following is stored on your device. It is not sent to us unless you turn on "Keep it safe".

| Stored on your device | Why |
|---|---|
| Coordinates, timing and pressure of the strokes you draw | To draw your Mongmangi's body and growth |
| Your sleep and morning times, when your Mongmangi slept and woke, and your device time zone | To work out each "day" (one sleep) |
| Game progress (temperament, stroke count, morning card history, your Mongmangi's name and ink, days together, favorite petting spots) | So you can continue where you left off |
| **Usual visit hours** (which hours of the day you open the App), **time away** (latest and longest), last visit time, install time | So your Mongmangi can seem to recognize you |
| Settings (notifications, sound, reduced motion, sending usage statistics, etc.) | To keep your preferences |
| Design test group (A or B, picked at random when you install) | For a test of the naming screen. It stays on your device even if usage statistics are off |
| Usage statistics waiting to be sent (up to 7 days' worth) and a record of game events already sent | To send them together after a lost connection, and so the same event is not counted twice. Turning off usage statistics deletes what is waiting |
| Age check result (only "under age" and the date, if you are under 14) | So we do not ask again the same day |

- Device tilt is used in the moment to make your Mongmangi glance around. It is not stored.
- The home screen widget only uses pictures stored on your device and sends nothing to any server.

## 3. Information sent to a server

### 3-1. Usage statistics (everyone; can be turned off)
- **What** (dates only; we never send times of day):
  - install date (by your device's calendar) and **the days you open the App** (once a day, as the number of days since install)
  - platform (iOS or Android), app release (for example 1.0 — no detailed build number), language
  - design test group (A or B), whether a home screen widget was in use on day 7 ("unknown" before day 7 or if it cannot be checked), whether the day is around a full moon
  - whether 10 fixed game events happened (first touch, first night, day seven, naming, choosing an ink, opening, link and image sharing, turning on Keep it safe, restoring a record) **and the day each happened** (days since install). For events that can repeat, such as sharing, we also count how many times
- **No identifiers**: we attach no account or device identifier; the server only adds up counts for each combination. The statistics contain no value showing who sent them, although the IP address used for the connection stays briefly in request logs as described below. [Legal review: whether these statistics are personal information]
- **Why**: to measure how many people keep playing and to improve the game.
- **Turn off**: Studio Notebook > Settings > "Send usage statistics". Nothing is sent after that, and statistics waiting on your device are deleted.
- **How it is sent**: if there is no connection, up to 7 days' worth is kept on your device and sent together later; anything older than 7 days is deleted unsent (section 2).
- **IP address**: your IP address reaches the server as part of the connection.
  - To block excessive requests, the server uses your IP address (for IPv6, the first 64 bits) in memory **for about one minute** only to count requests, and does not store it.
  - Our own server records (app logs) do not include IP addresses.
  - The cloud provider's access logs record the IP address, request path and time, and are deleted after **7 days** (sections 6 and 8).
  - We do not store IP addresses in our database together with these statistics.

### 3-2. App update checks (everyone)
- To ship bug fixes quickly, the App asks an update service (Expo's EAS Update, United States) for a new version **once a day, starting from the second launch**. It does not ask on first launch.
- **What**: platform, app version information, and IP address. A random installation identifier created per device by the update service may also be included [To verify: whether it is sent and how long it is kept — this line and section 8 will be updated together].
- We do not receive or see these requests. See sections 7 and 8 for processors and international transfers.

### 3-3. Downloading settings and content files (everyone)
- The App downloads feature on/off settings and new dream picture files from a web host (Google Firebase Hosting). Your IP address is used to serve these requests. We do not log them.

### 3-4. If you turn on "Share by link"
- **What**:
  - A random anonymous account identifier, a record that you passed the age check (version of the check and the date — your birth year and month are not sent), and the month you last used it
  - Sign-in session records: the anonymous account service (Supabase) may record the IP address, browser information (User-Agent) and time while managing sessions [To verify: whether recorded, how to turn off, retention — this line and sections 6 and 8 will be updated]
  - The public page copy: simplified lines of your strokes, a summary of your Mongmangi's inborn shape, its ink and grain name, its birth date, the number of days together on the day you turned the link on, language, and its name (**only if you turn on name visibility**)
  - Public images and an 8-second video made by the App (the name appears in the image only if name visibility is on)
- **Why**: to provide the shared-link web page. See section 5 for what is public.
- **Not sent**: stroke timing and pressure, usual visit hours, time away, visit times, device information such as model or operating system, location.

### 3-5. If you turn on "Keep it safe" (cloud backup)
- **What**: the account items in 3-4, plus **your whole game record**, which contains:
  - Coordinates, timing and pressure of your strokes
  - Sleep and morning time settings, when your Mongmangi slept and woke, device time zone
  - Game progress and your Mongmangi's name
  - **Usual visit hours** (which hours of the day you open the App), **time away** (latest and longest), **last visit time**, **install time**
- Sent along with each upload: the time it was saved on the device and a checksum (hash) of the record. **We do not send any value that tells devices apart (no device identifier or random device value).**
- The "recovery phrase" you use to move to a new device is stored on our server **only as a hash**.
- Taken together, these values could suggest **your daily rhythm** — when you open the App and how long you stay away. We keep them only inside your game record; we do not extract, search, or view them separately, and they never go on a public page.
- **Why**: so you do not lose your Mongmangi when you change devices or delete the App.

### 3-6. Visitors to shared-link web pages
- When a page opens, we count **one page load**. No cookies or identifiers are used, and this count does not store your IP address.
- We do not collect our own request logs for these pages, so IP addresses and link addresses are not logged together. To limit excessive requests, we briefly use your IP address in server memory without storing it. Processing by the web delivery provider (Google Firebase Hosting) is described in section 8.
- If you **report** a page, we keep a **pseudonymous value** derived from your IP address **for up to 7 days per reported page** to tell repeat reports from the same person, then delete it. We do not store information that identifies the reporter.

### 3-7. Send feedback
- "Send feedback" in the Studio Notebook only opens a web survey outside the App. The App does not attach your game record or any device information. Anything you type into the survey is handled under that survey service's policy, and we use it only to improve the game. [Survey tool name and policy link — to fill once chosen]

## 4. Age check and children under 14

- The App is intended for people **aged 14 and older**. It is not directed at children and does not take part in children's categories.
- Right before you first turn on a feature that creates an account ("Share by link", "Keep it safe", or the later "Night Water"), we ask once for your **birth year and month**. The check runs on your device, and **your birth year and month are not stored on your device or our server**.
- If you are under 14, no account is created and the feature stays off. Your device keeps only "under age" and the date so we do not ask again the same day. You can keep playing on your device and saving or sharing cards.
- We do not offer a parental consent process and do not create accounts for children under 14. The information in sections 3-1 to 3-3 is sent from every user without an age check. [To be revised after legal review]
- If we learn that a child under 14's information has been processed on our server, we will delete it without delay. Parents or guardians can contact us at the address in section 17.

## 5. What is public on a shared-link page

- "Share by link" is **off by default**. Only when you turn it on is a page published at `https://mongmang.ink/m/(8-character code)`. Anyone with the link can see it.
- The page shows only the public copy in 3-4, **fixed at the moment you turn the link on (or tap "Make it again")**. It does not change daily, so people with the link cannot learn your visiting rhythm.
- **Name visibility is off by default.** Even when on, names caught by our word filter or that look like contact details (7 or more digits in a row) are not shown; the page uses the App's name instead. Please do not use a real name or contact details as your Mongmangi's name.
- Pages are set not to be indexed by search engines, and we offer no list of public pages.
- **Turning it off**: the link stops at once in the App and on our server; because of caching, the web page disappears **within 1 hour**, and the public files are deleted. We cannot remove copies others have already downloaded or link preview cards already posted in messaging apps.
- If three different people report a page, it is hidden automatically, and we review it within 7 days to restore or remove it.

## 6. Retention and deletion

| Item | Kept for |
|---|---|
| Current game record (Keep it safe) | Until you delete your account |
| Earlier copies of the game record (for undo) | Latest 3 + one per week, **up to 4 weeks**; conflict and pre-restore copies 30 days |
| Public page copy, images, video | While the link is on (deleted when turned off; web cache up to 1 hour) |
| Public pages hidden after reports | Up to 30 days (restored or removed after review) |
| Recovery phrase | Hash only, until you delete your account (replaced with a new phrase after each recovery) |
| Old account after recovery to another device | **30 days** (the old device can no longer use the server), then deleted |
| Public images or video whose upload did not finish | Deleted after 6 hours |
| Sign-in session records (3-4) | [To verify: whether recorded and retention] |
| Age check pass record | Until you delete your account |
| Link page load counts | After 30 days, rolled into totals without the link code |
| Usage statistics (no identifiers) | After 90 days, rolled into monthly totals (dropping the date, full-moon and widget details) |
| Cloud access logs (IP address, request path, time) | 7 days. Our own server records (app logs) contain no IP addresses |
| Report records | 1 year (to spot repeat problems with the same page). Reporter pseudonymous values up to 7 days per reported page |
| Copies in database backups | Expire after 7 days |
| Emails with questions or requests | Deleted within [period — owner to decide] after the request is handled |
| **Inactive accounts** | **If you do not open the App for 2 years**, we delete everything you left on our server (account, game record, public page). We have no way to contact you, so this policy is our advance notice. Activity is recorded by month only |

- **How we delete**: electronic files are deleted so they cannot be recovered. Deleting your account removes the game record, earlier copies, public page, link statistics, and age check record together; copies in backups expire after 7 days.
- Your on-device game record is deleted when you uninstall the App.

## 7. Service providers (processors)

We use the following providers to run the service. [Legal review: confirm contract basis]

| Provider | Task |
|---|---|
| Supabase, Inc. | Database, anonymous account authentication, public file storage |
| Google LLC (Google Cloud Run, Cloud Logging, Cloud Scheduler) | Running the server, keeping request logs, running scheduled clean-up jobs |
| Google LLC (Firebase Hosting) | Delivering web pages and settings/content files |
| 650 Industries, Inc. (Expo, EAS Update) | Delivering app updates |
| [Email service provider — owner to fill] | Receiving and keeping question and request emails |
| [Add if adopted: Cloudflare, Inc. — web page front end (Worker) and large web file delivery (R2). This policy will be updated before adoption] | |

## 8. International transfers

Our data is stored in the Seoul (Republic of Korea) region, but because the providers below are foreign companies or use servers abroad, we disclose them as international transfers.

| Recipient (contact) | Country | Items | When and how | Purpose | Retention |
|---|---|---|---|---|---|
| Supabase, Inc. ([contact — to verify]) | United States (company). Stored in the Seoul region; remote access for operations is possible | Items in 3-4 and 3-5 | From when you turn on "Share by link" or "Keep it safe", as you use them; encrypted (TLS) | Storage and authentication | As in section 6 |
| Google LLC ([contact — to verify]) — Cloud Run, Cloud Logging, Cloud Scheduler | United States (company). Processed and stored in the Seoul region | Request data (IP, request path, request time) and what is sent under 3-1, 3-4 and 3-5 | While you use the App; TLS | Running the server, logs | Logs 7 days |
| Google LLC — Firebase Hosting | Content delivery servers near you (country cannot be specified) | IP address, public page content | On file and page requests; TLS | Delivering web pages and files | No logs kept by us; per Google's policy [to verify] |
| 650 Industries, Inc. ([contact — to verify]) | United States | Platform and app version information, IP address, installation identifier [to verify] | Once a day from the second launch; TLS | Delivering app updates | Per Expo's policy [to verify] |
| [Email service provider — owner to fill; complete this row if it is a foreign company] | | Email address, message content | When you email us | Handling your request | As in section 6 |
| [Add if adopted: Cloudflare, Inc. (United States) — web page visitors' IP addresses, public content] | | | | | |

- **How to refuse, and what happens**: if you do not turn on "Share by link" or "Keep it safe", no account data is transferred, and the on-device game keeps working. Update checks and file requests are needed for the App to work and cannot be refused separately, so we keep them to a minimum. You can turn off usage statistics in Settings. [Legal review: confirm the legal basis and finalize this wording]

### Notes for players outside Korea

You can use the rights in section 12 wherever you live. If you are not satisfied with our answer, you may also be able to contact the privacy authority where you live. [Legal review: confirm which rights and authorities apply, and add official contact details before publication]

| Where you live | Privacy authority [to verify] |
|---|---|
| Canada | Office of the Privacy Commissioner of Canada [contact — to verify] |
| Québec | Commission d'accès à l'information du Québec [contact — to verify] |
| Philippines | National Privacy Commission [contact — to verify] |
| New Zealand | Office of the Privacy Commissioner [contact — to verify] |
| Republic of Korea | Personal Information Dispute Mediation Committee; Personal Information Infringement Report Center (KISA) [contact — to verify] |

## 9. Disclosure to third parties

We do not provide your personal information to third parties. A shared-link page is public because you chose to turn it on (section 5). [Legal review: wording for requests required by law]

## 10. Device backup and export

- If device backup is on (iCloud Backup on iOS, Auto Backup on Android), your game record may be included in **your own Apple or Google account backup**. That backup is handled under Apple's or Google's terms; we have no access to it. Your server sign-in session is excluded from backups. [To verify in build: backup inclusion and exclusion]
- A save export code is something you copy and keep yourself. It is not sent to us.

## 11. Notifications, saving and sharing cards

- The App uses **local notifications scheduled on your device only**. We do not collect push tokens. You choose whether to allow notifications when first asked, and you can turn them off anytime in your device settings.
- A morning card is saved or shared **only when you tap to do so**, through your device's standard share sheet to the app you choose; we do not receive it. Saving to your photo library may ask for add-only access; the App does not read your existing photos. [To verify in build: save method and permission scope]

## 12. Your rights and how to use them

You may ask to access, correct, delete, or stop the processing of your personal information at any time.

| To do this | How |
|---|---|
| Delete everything on our server | In the App: Studio Notebook > "Delete what's kept on the server" (processed right away) |
| Delete without the App | Web deletion page `https://mongmang.ink/delete` — processed within 7 days **when both your share link code and your recovery phrase match**. Accounts are anonymous, so the phrase is our only way to confirm it is you |
| Stop a public page | Turn off "Share by link" in the App |
| Hide only the name | Turn off name visibility in the App and tap "Make it again" |
| Stop usage statistics | Turn off "Send usage statistics" in Settings |
| Delete on-device data | Uninstall the App |
| Access, correction, other requests | Email in section 17. **Please do not put your recovery phrase in an email** — delete your data yourself in the App or on the web deletion page. How we confirm your identity for email requests: [to fill after legal review] |

- If you have lost your recovery phrase and uninstalled the App, we may have no way to confirm your identity and may be unable to act on a request. In that case, what you left on our server will be deleted by the 2-year inactivity rule in section 6. [To be supplemented after legal review]

## 13. Cookies and tracking

- The App and Web Pages use no cookies or similar tracking technologies. The page load signal on Web Pages (3-6) only adds to a count, with no cookies or identifiers.
- We do not link data with other companies' apps or websites to track you, and we do not show targeted ads.

## 14. Security

- All server traffic is encrypted (TLS). The App's server, which handles your game record and sign-in data, is reached directly in the Seoul region without passing through overseas delivery servers.
- Recovery phrases are stored only as hashes, and share link codes are hard-to-guess random values.
- The server does not extract any value from your game record other than day count, stroke count and version, and there is no admin screen for viewing game records.
- Only values checked against an allow-list by the server go on a public page.
- Logs do not contain sign-in tokens, recovery phrases, or game record contents.
- Administrative access to the server and database is limited to the operator alone. [To verify in build: two-factor authentication on admin accounts]
- On your device, the game record is kept in app-private storage (an area the operating system protects from other apps).

## 15. If the service ends

If we ever shut down the server, we will tell you in the App and on this page **90 days in advance** and let you download what you kept on the server during that time. The on-device game keeps working without the server. After shutdown, all server data is deleted.

## 16. When data handling changes

If we add a new kind of data processing, such as crash reporting, we will update this policy before that version is released — saying what is sent and where — and let you know in the App.

## 17. Contact

| | |
|---|---|
| Privacy officer | [Operator's legal name — owner to fill] |
| Role | Operator (solo developer) |
| Email | [Contact email — owner to fill] |

Requests for access or deletion and complaints are handled at the email above. Emails we receive (your email address and message) are used only to handle your request and deleted within the period in section 6. [Legal review: how a solo operator designates a privacy officer]

## 18. Changes to this policy

We will post any change on this page and in the App before it takes effect, and keep earlier versions available on this page.

### Version history

| Version | Date | Changes |
|---|---|---|
| v1 | Not published | First version (no server, no collection). Pre-publication change (2026-11-20): added the name, ink and relationship values (stored on device) and the "Send feedback" web survey line |
| **v2** | [Effective date — owner to fill] (draft 2026-11-20) | Reflects the new server: usage statistics (no identifiers, can be turned off), app update checks, settings file requests (3-1 to 3-3); anonymous account and data when you turn on "Share by link" or "Keep it safe" (3-4, 3-5 — usual visit hours, time away, stroke timing and pressure named explicitly); Web Page visitors and 7-day pseudonymous report values (3-6); 14+ audience and age check (4); what is public (5); retention table, 2-year inactivity rule and 30-day old account rule (6); sign-in session records (3-4) and no device value sent (3-5, A4 review decision 2026-11-20); notes for players outside Korea (8); processors (7) and international transfers (8); how to use your rights (12); service-end promise (15) |
