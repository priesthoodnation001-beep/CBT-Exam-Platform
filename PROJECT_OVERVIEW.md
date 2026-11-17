# TIMPRIEST EDU CBT Exam Platform

## At a glance

TIMPRIEST EDU is a school-focused computer-based testing (CBT) platform for creating and administering online examinations. It gives each school a shared workspace for account administration, question preparation, exam scheduling, student assessments, results, and credit management. Separate Creator, Admin, Teacher, and Student experiences provide role-appropriate access to the platform.

## Users and capabilities

| User | Main capabilities |
|---|---|
| Creator | Oversee schools, manage credit pricing and school balances, review payments, monitor activity, and respond to support requests. |
| School Admin | Manage teacher and student accounts, organize students by class and section, schedule exams, approve submitted question subjects, manage billing, review results, and archive questions. |
| Teacher | Prepare questions by subject, save drafts, submit work for approval, and review assigned exams. |
| Student | View available exams, complete timed assessments, and access the student experience for their school. |

## Core platform functions

- School registration and school-specific sign-in links.
- Separate Admin, Teacher, Student, and Creator interfaces.
- Student organization across SSS 1–3 and Science, Art, and Commercial sections.
- Teacher question authoring, draft saving, and Admin approval workflow.
- Exam scheduling and timed student assessments.
- Question archive organized by saved date, with print-to-PDF support and question reuse when scheduling a later exam.
- Results and printable result slips.
- School credits, payment verification, credit adjustments, and Creator-managed credit pricing.
- Support conversations between schools and the Creator.
- Role-specific Android applications and Windows desktop installers.

## Technology and delivery

- **Web interface:** React, TypeScript, and Vite.
- **Server:** Node.js and Express.
- **Data:** SQLite, accessed by the server.
- **Mobile packaging:** Capacitor for Android.
- **Desktop packaging:** Electron for Windows.

The Android role apps open the hosted platform, so deployed web-interface updates become available when users next open or reload the app. Native Android changes, such as the launch splash, require the Android package to be rebuilt. The Windows desktop interface is packaged with the installer; desktop releases use the configured update flow.

## Intended outcomes

- Reduce the effort required to prepare, schedule, and administer school exams.
- Make exam preparation and results easier to manage in one school workspace.
- Give staff and students clear, role-specific journeys.
- Preserve reusable question content and support future exam scheduling.
- Provide a centrally manageable service for participating schools.

## Operational considerations

The hosted experience depends on internet access and availability of the web service. Payment processing, authentication, student privacy, database backups, and release management should be monitored as part of ongoing operation. Actual service availability and performance depend on the production hosting and operational setup.
