#### **PRODUCT SPECIFICATION** 

# **Employee Activity & Screen Monitoring System** 

_Features · User Flow · Architecture & Tech Stack · Research · Roadmap_ 

## **1. What This System Does (Plain-English Overview)** 

Think of this as a digital time clock combined with a security camera, built for remote or hybrid employees. Instead of punching a physical time card, an employee opens a web page, logs in, and presses “Check In.” The system only lets them do that during their assigned shift window (plus a small grace period the admin controls, e.g. 15 minutes). Checking in also starts a recording of their screen, so the employer can confirm the person is actually working and can review it later if needed. 

The admin (business owner / manager) has a control panel where they create employee accounts, assign each employee a shift (start time, end time), set the grace period, watch who is currently working in real time, and browse past recordings. 

The core idea: no check-in without being inside the shift window, no working session without an active screen share, and no silent background tracking — the employee always sees that they are being recorded, and closing the tab always ends the session. 

## **2. Core Features (as specified)** 

- **Admin-created accounts:** Only the admin can create employee logins (username + password). Employees cannot selfregister. 

- **Shift scheduling per employee:** Admin sets a shift start time and shift end time for each employee (e.g. 8:00 AM – 8:00 PM). 

- **Configurable check-in grace period:** Admin sets a grace window, e.g. 15 minutes. If the shift starts at 8:00 AM, the employee can check in any time up to 8:15 AM and it still counts as on-time. 

- **Late check-in cutoff:** After the grace period passes, check-in is either blocked or automatically flagged “Late” for the admin's records (recommend making this configurable — see Section 3). 

- **Check-in / check-out flow:** Employee must actively check in to start being tracked, and check out at the end of the shift to stop. 

- **No persistence across tab close:** If the employee closes or reloads the browser tab, their session ends immediately. They must check in again to resume — there is no “silently still checked in” state. 

- **Screen share required to check in:** The Check-In button only becomes usable once the employee has granted screensharing permission. No screen share, no check-in. 

- **Live screen viewing for admin:** While an employee is checked in, the admin can open that employee's live screen view at any time. 

- **Recording storage:** Every checked-in session is recorded and saved so the admin can review it later, not just watch live. 

## **3. Recommended Additional Features** 

These aren't in your original description but are the features that turn this from “a script” into “a product.” Grouped by why they matter. 

### **3.1 Reliability & fairness (protects both sides)** 

- Automatic checkout on screen-share drop or long inactivity — not just tab close. 

- Visible “you are being recorded” indicator on the employee's screen at all times while checked in — builds trust and matters legally (see Section 6.2). 

- Grace-period behaviour should be configurable: block late check-in entirely, OR allow it but flag as “Late” — different businesses want different strictness. 

- Break / pause tracking: a “Take a break” button that pauses the clock without fully checking out, for lunch etc. 

### **3.2 Admin visibility & control** 

- Live dashboard: one screen showing every employee's current state — Not checked in / On time / Late / On break / Checked out. 

- Attendance & analytics reports: hours worked per day/week, punctuality trends, per-employee history — exportable to CSV/Excel. 

- Recording library: searchable/filterable archive by employee, date, and session status. 

- Role-based access: Super Admin, Manager (limited to their team), Employee — not everyone should see everyone's recordings. 

- Audit log of every admin action (account created, shift changed, recording viewed) — useful for accountability and disputes. 

- Notifications (email / Slack / in-app) for late check-in, missed checkout, or shift about to start. 

### **3.3 Employee experience** 

- Employee self-service view: their own attendance history and total hours — reduces “he-said-she-said” disputes. 

- Multiple shift templates and per-employee assignment (not everyone works the same hours). 

- Timezone-aware scheduling if employees are in different regions. 

### **3.4 Scale, cost & compliance** 

- Configurable recording retention policy (e.g. auto-delete after 30/60/90 days) — storage for full-day video for many employees gets expensive fast. 

- Adjustable recording quality/frame rate to control bandwidth and storage cost. 

- Encrypted storage for recordings at rest, and encrypted transport (HTTPS/WSS) in transit. 

- A consent / privacy-notice screen the employee must accept before their first check-in (see Section 6.2 — this is close to a legal requirement, not just a nice-to-have). 

- Two-factor authentication for admin accounts, since they can view sensitive recordings. 

## **4. User Flow** 

### **4.1 Employee flow** 

1. Opens the web app and logs in with the username/password the admin created. 

2. If current time is within [shift start − 0] to [shift start + grace period] through shift end, the Check-In button is enabled. Outside that window it stays disabled (or shows “Late” depending on admin settings). 

3. Taps Check-In → the browser asks for screen-share permission (this is a native browser prompt; it cannot be skipped or automated — see Section 6.1). 

4. Once screen sharing is confirmed, the session officially starts: the clock starts, recording begins, and a visible “Recording” badge appears on their screen. 

5. Employee works normally. If they stop sharing their screen, or close/reload the tab, the session ends immediately and is marked “Interrupted” or “Ended Early.” 

6. To resume, they must check in again — a fresh screen-share prompt appears. 

7. At shift end, employee taps Check-Out. Screen sharing stops, the recording is finalized and uploaded. 

8. Employee can view their own past attendance and hours in a simple history page. 

### **4.2 Admin flow** 

9. Logs into the Admin Panel (recommend 2FA here, since it has access to recordings). 

- 10.Creates a new employee: name, email, username, temporary password, and assigns a shift template (start time, end time, grace period). 

- 11.Can create reusable shift templates (e.g. “Morning 8–10”, “Night 8pm–8am”) and apply them to one employee or a whole team. 

- 12.Views a live dashboard showing every employee's current status. 

- 13.Clicks on any “currently checked-in” employee to open their live screen view. 

- 14.Browses the recording archive, filters by employee/date, and plays back past sessions. 

- 15.Reviews attendance/punctuality reports and exports them if needed. 

- 16.Manages system settings: retention policy, grace periods, notification rules, roles. 

## **5. System Architecture & Tech Stack** 

Explained simply, then mapped to actual technology. This is aligned to your existing stack (Node.js/Fastify, React/Next.js, PostgreSQL, Redis, Docker, AWS/nginx) so it plugs into what you already run for CallGrid-style infrastructure. 

### **5.1 In plain English** 

- A website (frontend) the employee and admin both use — same app, different views depending on role. 

- A server (backend) that checks logins, enforces shift/grace-period rules, and keeps track of who is checked in. 

- A database that remembers employees, shifts, and every check-in/check-out record. 

- A “who's online right now” fast-memory layer, so the admin dashboard updates instantly without hammering the database. 

- A video pipeline that takes the employee's shared screen, sends it live to the admin (if they're watching), and also saves a copy to storage for later. 

- A file storage bucket (cloud storage) that holds all the recorded videos, since databases aren't built to store large video files. 

### **5.2 Recommended stack** 

|**Layer**|**Technology**|**Why**|
|---|---|---|
|Frontend (employee +<br>admin)|Next.js / React|Matches your current stack; one app, role-<br>based views (employee vs admin).|
|Backend API|Node.js + Fastify|Handles auth, shift rules, employee/session<br>CRUD — consistent with your CallGrid<br>Core Service.|
|Screen capture (employee<br>side)|Browser getDisplayMedia() +<br>MediaRecorder API|Native browser APIs; no plugin needed. This<br>is what actually asks for screen-share<br>permission.|
|Live view (admin watching<br>in real time)|WebRTC via an SFU (e.g. LiveKit or<br>mediasoup)|MediaRecorder alone only produces a file<br>after the fact; true “live” viewing needs|



|**Layer**|**Technology**|**Why**|
|---|---|---|
|||WebRTC with a media server relaying the<br>stream.|
|Real-time status / signaling|WebSocket (Socket.io) + Redis<br>pub/sub|Powers the “who's checked in right now”<br>live dashboard and WebRTC handshake.|
|Primary database|PostgreSQL|Employees, shifts, sessions, attendance<br>history — structured, relational data.|
|Session/live-state cache|Redis|Fast lookups for “is this employee currently<br>checked in,” used by both the API and the<br>dashboard.|
|Recording storage|AWS S3 (or S3-compatible bucket)|Purpose-built for large video files; supports<br>lifecycle rules for auto-deletion (retention<br>policy).|
|Background processing|BullMQ (Redis-backed queue)|Finalizing recordings, transcoding, applying<br>retention/cleanup jobs without blocking the<br>API.|
|Auth|JWT + refresh tokens, optional TOTP<br>2FA for admins|Stateless, standard, and you're already using<br>this pattern.|
|Infra / deployment|Docker, AWS EC2, nginx reverse<br>proxy, Certbot SSL|Same pattern as your existing callloom.com<br>deployment.|
|High-throughput path<br>(future/optional)|Rust (Actix Web) ingestion<br>microservice|If recording-chunk volume grows large, a<br>Rust service can absorb ingestion load the<br>way your Call Service does for CallGrid.|



### **5.3 High-level data model** 

|**Table**|**Key fields**|**Purpose**|
|---|---|---|
|users|id, name, email, username, password_hash,<br>role|Admin, manager, and employee accounts.|
|shift_templates|id, name, start_time, end_time,<br>grace_minutes, timezone|Reusable shift definitions admin creates.|
|employee_shifts|employee_id, shift_template_id,<br>effective_from, effective_to|Which shift applies to which employee, and<br>since when.|
|sessions|id, employee_id, check_in_at,<br>check_out_at, status, recording_id|One row per check-in/check-out cycle.<br>status = on_time / late / interrupted.|
|recordings|id, session_id, file_url, duration_sec,<br>size_bytes, created_at|Pointer to the stored video file, not the file<br>itself.|
|audit_log|id, actor_id, action, target, created_at|Every admin action, for accountability.|
|notifications|id, user_id, type, message, read, created_at|Late check-in / missed checkout / shift-<br>starting alerts.|



## **6. Research & Technical Considerations** 

### **6.1 Screen capture: what's actually possible in a browser** 

Two different browser technologies solve two different problems, and it's worth understanding both before building: 

- **getDisplayMedia() + MediaRecorder:** Captures the screen and produces a video file in the browser. Good for recording-and-upload-later. On its own it does NOT give the admin a live view — the admin would only see the video after it's uploaded. 

- **WebRTC (with an SFU like LiveKit / mediasoup / Janus):** Streams the screen live, frame by frame, to anyone watching (the admin) in near real time. This is the right tool for “admin can see the screen at any time.” It's more infrastructure (needs a media server, and usually a TURN server for users behind restrictive networks), but it's the only real option for true live viewing. 

Practical recommendation: use WebRTC for the live view, and record the session either on the media-server side (server-side recording, simplest and most tamper-resistant) or via MediaRecorder in parallel, uploading chunks periodically so a browser crash doesn't lose the whole session. 

Important browser limitation to plan around: getDisplayMedia() always shows a native “Share your screen?” permission prompt — this cannot be bypassed, pre-approved, or triggered silently by any website, in any browser, by design (it's a security boundary). That means every single check-in will require the employee to click through that prompt. This is a hard constraint, not a bug to fix. 

### **6.2 Legal & privacy — read before launch** 

Recording employees' screens is legal in most places, but it is genuinely regulated, and the rules vary by country/state. This section is general awareness, not legal advice — have a lawyer review before rolling this out to real employees, especially across multiple countries. 

- Most jurisdictions require employees to be clearly informed that monitoring/recording is happening — a buried clause in a contract is often not considered sufficient; an explicit, acknowledged notice is safer. 

- Some regions (e.g. under GDPR in the EU/UK) treat screen recordings as personal data and require a documented lawful basis, data minimization (don't record more than needed), and a defined retention period rather than indefinite storage. 

- A visible “recording in progress” indicator on the employee's own screen (already recommended in Section 3.1) meaningfully strengthens the “informed consent” position. 

- Give employees a way to see their own recordings/history — reduces disputes and is viewed favourably in most privacy frameworks (transparency). 

- Define and enforce a retention policy (auto-delete after N days) rather than keeping everything forever — both a cost control and a compliance best practice. 

### **6.3 Existing landscape** 

Employee monitoring with screen recording is an established product category — tools like Hubstaff, Time Doctor, Teramind, ActivTrak and Insightful all solve a similar problem, typically via a desktop agent rather than a browser tab. A pure browser-based approach (no install) is a genuine differentiator — easier onboarding, no admin-rights install friction — but it does mean you inherit the browser's permission model and its limitations described in 6.1, whereas a desktop agent can run more persistently in the background. 

## **7. Roadmap** 

### **Phase 1 — MVP (target: 4–6 weeks)** 

- Admin: create employees, assign shift templates (start/end time + grace period). 

- Employee: login, Check-In/Check-Out gated by shift window. 

- Screen-share required to check in (getDisplayMedia + MediaRecorder), recording uploaded to S3 after session ends (recorded, not yet live). 

- Auto-checkout on tab close / screen-share stop. 

- Basic admin dashboard: employee list with current status + recording playback. 

### **Phase 2 — Live monitoring & operations (target: +3–4 weeks)** 

- WebRTC live screen view for admin (real-time, not just after-the-fact recordings). 

- Notifications: late check-in, missed checkout, shift starting soon. 

- Attendance & punctuality analytics/reports, exportable. 

- Role-based access (Super Admin / Manager / Employee) and audit log. 

### **Phase 3 — Scale & compliance (ongoing)** 

- Consent/privacy-notice flow, visible recording indicator, legal review pass. 

- Configurable retention policy with automated deletion; encryption at rest. 

- Multi-timezone / multi-shift-template support. 

- Mobile-responsive PWA. 

- Admin 2FA. 

- Optional: Rust ingestion microservice if recording volume/concurrency grows beyond what Node comfortably handles. 

## **8. Risks & Mitigations** 

|**Risk**|**Mitigation**|
|---|---|
|Recording storage costs grow fast (many<br>employees × full shifts × video)|Compress video, cap resolution/frame rate, enforce retention<br>policy with auto-delete.|
|Legal/privacy exposure from recording without<br>proper consent|Explicit consent screen, visible recording indicator, documented<br>policy, legal review before launch.|
|Employees can't be silently tracked — browser<br>always prompts for screen share|Design the UX around this reality (it's a constraint, not a fixable<br>bug); make the prompt part of a smooth check-in ritual.|
|WebRTC/live-view infrastructure adds real<br>complexity|Ship Phase 1 with recorded-only sessions first; add live view in<br>Phase 2 once core flow is proven.|
|Employee trust/morale impact of heavy<br>monitoring|Transparency (employees can view their own recordings), clear<br>written policy, keep monitoring scoped to work hours only.|



_End of document._ 

