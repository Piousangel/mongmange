# Privacy Policy for the Mongmangi Test Build

- Applies to: the Mongmangi **test build** distributed from December 19, 2026 (Google Play closed test, Android) and emails asking to join the test
- Effective date: December 19, 2026
- Contact: hello@mongmang.ink

The operator of Mongmangi ("we") handles the personal information of people who use the test build and people who ask to join the test as described in this policy. When the App officially launches, we will post the full Privacy Policy for the App at this address and keep this policy available as an earlier version.

**In plain words first**

- Only people aged 14 or older can ask to join the test. The game runs on your phone, and what you write with the brush is read only on your phone.
- We do not take your name, phone number, location or photos. This test build has no account, no usage statistics, no ads and no purchases.
- Two things leave your phone: the App asking whether there is a new version, and Google's handwriting feature downloading its reading tool and telling Google how well it is working. Your handwriting is not part of it.
- The email you sent to join the test is deleted 30 days after the official launch.
- If you have a question or want something deleted, email hello@mongmang.ink. If you are under 14, please ask a parent or guardian to help.

## 1. What the test build sends off your phone

The only information this test build sends to our server or to other companies is described in 1-1 and 1-2. Usage statistics, Share by link and cloud backup (Keep it safe) are turned off in this build, so no account is created and no game record goes to a server. Before releasing an update that turns on more features, we will update this policy first and let you know in the App.

### 1-1. App update checks (every tester)

- To ship bug fixes quickly, the App asks **our own update server** (Google Cloud Run, Seoul region, Republic of Korea) whether a new version exists, **once a day by your device's calendar, starting from the second launch**. It does not ask on first launch. Requests pass through Google's web delivery service (Firebase Hosting, a worldwide network) before reaching the server in Seoul.
- Exceptions: if the App stops with an error right after starting (including on first launch), the update component checks once for a fixed version; and if the App ends abnormally twice in a row, it skips the once-a-day limit and asks right away.
- What the request carries: platform, app runtime version and update channel, the identifiers of the update currently in use and of the update built into the App (the same values for every tester on the same version), your IP address, and basic connection information such as the User-Agent.
- What is not sent: the random per-installation identifier, the identifiers of failed updates and the error message that stopped the App, which the update component adds as standard, are replaced with the same fixed value (or an empty value) for every tester. So an update check cannot tell installations or devices apart.
- We use only the values needed to pick the right update, in the moment, and do not keep them in our database or our server records (app logs). To block excessive requests, the server uses your IP address (for IPv6, the first 64 bits) in memory for about one minute only to count requests.
- The cloud provider (Google Cloud Run) creates an access log for each request with the IP address, User-Agent, request path, time and similar details, but we have set things up so that we do not receive or keep these logs. We may receive them briefly only while investigating an outage, and anything received then is deleted after at most 7 days. Our own server records (app logs and error logs) are kept for 7 days and do not include IP addresses or User-Agents.
- We have not turned on the feature that sends Firebase Hosting's request logs for update requests to our logs, so we do not receive them. Any records Google keeps itself to run the service follow Google's policy.
- A downloaded update is applied the next time the App starts fresh; it never changes while you are using the App.
- **Purpose and legal basis**: to provide the test build and deliver bug fixes (performance of contract, Korea's Personal Information Protection Act, Article 15(1)(4); to the extent that does not apply, our legitimate interest in security and bug fixes, Article 15(1)(6)). Because this does not rely on consent, it works the same way regardless of age.

### 1-2. Handwriting recognition (every tester)

- Your word of the day is read **on your device** by Google's ML Kit Digital Ink Recognition. The first time you write, the App downloads a recognition model for your language (about 20 MB) from Google's servers, which uses your IP address.
- **Your handwriting (strokes) and the recognition result are not sent to Google or to us.** If the model cannot be downloaded, you can type instead.
- While it works, the handwriting recognition feature sends Google diagnostic data: device information (manufacturer, model, operating system version and build, available ML hardware accelerators), app information (package name and app version), per-installation identifiers, performance metrics (such as latency), feature configuration, the configured recognition language, input and output size, feature version, event type, and error codes. Google uses this data for ML Kit diagnostics and usage analytics. We do not receive or see it. Details are in Google's ML Kit data disclosure (https://developers.google.com/ml-kit/android-data-disclosure).
- **Purpose and legal basis**: downloading the recognition model is needed to provide handwriting (performance of contract, Article 15(1)(4) of the same Act; to the extent that does not apply, legitimate interest, Article 15(1)(6)). Whether Google's direct receipt of the ML Kit diagnostics counts as processing on our behalf or as a disclosure to a third party is still being confirmed; we will update this policy accordingly.

## 2. Information stored only on your device

The following is stored only on your device and is not sent to us. It is deleted when you uninstall the App.

- The stroke coordinates of the word of the day you write with the brush and the category the word falls into; coordinates, timing and pressure of the strokes you draw; how much ink you ground on the inkstone
- Sleep and morning time settings, when your Mongmangi slept and woke, device time zone, game progress (your Mongmangi's name, chosen ink, days together and so on)
- Usual visit hours (which hours of the day you open the App), time away, last visit time, install time — used so your Mongmangi can seem to recognize you
- Settings (notifications, sound, reduced motion and so on); when the App was first launched and when it last tried to check for updates; whether it was closed normally and how many times in a row it ended abnormally
- Device tilt is used in the moment to make your Mongmangi glance around. It is not stored.
- If device backup (Android Auto Backup) is on, your game record may be included in your own Google account backup. We have no access to that backup.

## 3. Notifications, saving and sharing cards

- The App uses only local notifications scheduled on your device. We do not collect push tokens. You choose whether to allow notifications when first asked, and you can turn them off anytime in your device settings.
- A morning dream card is saved or shared only when you tap to do so, through your device's standard share sheet to the app you choose. We do not receive it.
- The rating prompt is shown by Google Play itself. We do not receive your rating or whether you rated.

## 4. Emails asking to join the test

- What we receive: the email address and content of emails asking to join the Android closed test.
- What it is used for: only to add your address to the tester list of the Google Play closed test and to send you test information.
- How it reaches us: email sent to hello@mongmang.ink is forwarded by Cloudflare Email Routing to the operator's Gmail. It is not stored on our server. Emails are read only by the operator (a person) and are not passed to AI tools.
- When it is deleted: 30 days after the official launch, we delete the emails we received and your address in the tester list. If you ask earlier, we delete it right away.
- Only people aged 14 or older can ask to join the test.

## 5. Retention and deletion

| Item | Kept for |
|---|---|
| Values in update checks | Not stored |
| Cloud access logs (Cloud Run request logs — IP address, User-Agent, request path, time and similar details) | Not received. We receive them briefly only while investigating an outage, and anything received then is kept at most 7 days |
| Our own server records (app logs and error logs) | 7 days. They do not include IP addresses or User-Agents |
| Emails asking to join the test and addresses in the tester list | Deleted 30 days after the official launch (right away if you ask) |
| On-device information (section 2) | Until you uninstall the App (on your device only) |

Electronic files are deleted so they cannot be recovered.

## 6. Service providers and international transfers

We use the following providers. Because they are foreign companies or use facilities abroad, we also disclose them as international transfers. These transfers are outsourcing and storage needed to provide the test build and run the test, made after disclosing the items below, under Article 28-8(1)3 of Korea's Personal Information Protection Act.

| Recipient (contact) | Country | Items | When and how | Purpose | Retention |
|---|---|---|---|---|---|
| Google LLC (https://support.google.com/policies?p=privpol_privts) — Cloud Run, Cloud Logging | United States (company). Processed and stored in the Seoul region. The encrypted connection may be handled at a Google network edge location in a country near you | Request data in 1-1 (IP, User-Agent, request path, time) | During update checks; TLS | Running the update server, server records | Our app and error logs 7 days (no IP or User-Agent). Request access logs not received (at most 7 days, only while investigating an outage) |
| Google LLC — Firebase Hosting | Countries near where you connect (worldwide delivery network) | IP address, update checks and update files | During update checks; TLS | Passing on update requests, delivering files | No logs kept by us; per Google's policy |
| Google LLC — ML Kit (handwriting recognition) | United States (company) | Diagnostic data in 1-2, IP address when downloading the model | When the model is downloaded and while recognition runs; TLS | Model delivery, ML Kit diagnostics and usage analytics | Per Google's policy |
| Google LLC — Google Play Console | United States (company) | Tester email address | When you are added as a tester | Managing the closed test's testers | Removed from the list 30 days after the official launch |
| Cloudflare, Inc. (privacyquestions@cloudflare.com) — Email Routing | United States | Sender's email address, the email (forwarded only; content not stored) | When you email us; TLS | Forwarding to the operator's mailbox | Content not stored |
| Google LLC — Gmail | United States (company) | Email address, message content | When you email us; TLS | Sending test information, handling questions | Deleted 30 days after the official launch |

- How to refuse and its effect: update checks and handwriting recognition are needed for the test build to work and cannot be refused separately. If you do not want them, leave the test and uninstall the App. If you do not send an email asking to join, none is processed.
- Handwriting recognition diagnostics are sent directly to Google by the Google ML Kit component inside the App; they are not data we receive and pass on.

## 7. Children under 14

- Only people aged 14 or older can ask to join the test, and features that create an account and usage statistics are not turned on in the test build.
- The update checks and handwriting recognition in section 1 are needed for the App to work and are sent regardless of age.
- If we learn that we received a test request email from a child under 14, we delete it without delay.

## 8. Your rights and how to use them

- You may ask to access, correct, delete, or stop the processing of your personal information at any time by emailing hello@mongmang.ink.
- We delete test request emails and your address in the tester list right away if you ask.
- On-device information is deleted when you uninstall the App. Update checks are not stored, so there is no record to delete, and we do not receive cloud access logs; any received while investigating an outage are deleted automatically after at most 7 days.

## 9. Cookies and tracking

- The App and the website use no cookies or similar tracking technologies. We do not link data with other companies' apps or websites to track you, and we show no ads.

## 10. Security

- All server traffic is encrypted (TLS). The App applies an update only after checking our signature on it.
- Server logs do not contain the values in update checks or IP addresses.
- Administrative access to the server and the mailbox is limited to the operator alone, with two-factor authentication.
- On your device, the game record is kept in app-private storage.

## 11. Contact and privacy officer

| Item | Details |
|---|---|
| Name (or business name) | [Name or business name — owner to fill] |
| Role | Operator (solo developer) |
| Email | hello@mongmang.ink |

Requests for access or deletion and complaints are handled at the contact above. The operator is also the Privacy Officer (New Zealand), the person in charge of the protection of personal information (Québec) and the Data Protection Officer (Philippines).

## 12. If you are not satisfied

You can contact the privacy authority where you live. In the Republic of Korea: Personal Information Dispute Mediation Committee (1833-6972, www.kopico.go.kr) and Personal Information Infringement Report Center (118, privacy.kisa.or.kr).

## 13. Changes to this policy

We will post any change on this page and in the App before it takes effect. This policy exists in Korean and English. If they differ, the Korean version prevails for users in the Republic of Korea, and the English version prevails for everyone else.
