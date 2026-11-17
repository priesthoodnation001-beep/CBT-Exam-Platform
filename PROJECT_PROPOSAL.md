# Project Proposal: TIMPRIEST EDU CBT Exam Platform

**Prepared:** 16 October 2026  
**Project type:** School examination and assessment platform  
**Proposed delivery approach:** Phased implementation, validation, and rollout

## 1. Executive summary

TIMPRIEST EDU proposes a centralized computer-based testing platform to help schools manage examination preparation and delivery. The platform brings school account administration, teacher question preparation, exam scheduling, timed student assessments, results, question archiving, and credit-based billing into a set of role-specific experiences.

The service is designed for use through the web and companion Android and Windows applications. Schools use the shared online service, while the Creator experience provides platform-level oversight of schools, payments, pricing, activity, and support.

This proposal describes the platform’s objectives, scope, delivery approach, success measures, and operational considerations. The detailed features in the companion [Project Overview](./PROJECT_OVERVIEW.md) describe the current product direction; rollout dates, service targets, and school-specific requirements should be confirmed with stakeholders before commitment.

## 2. Background and need

Schools need a practical way to organize examination workflows across administrators, teachers, and students. When accounts, question preparation, scheduling, assessment, and results are handled in separate processes, staff may spend additional time coordinating work and maintaining records.

TIMPRIEST EDU addresses this need with a shared school workspace and role-based workflows. Teachers prepare questions, administrators review and schedule examinations, and students complete timed exams. A question archive supports retention and later reuse.

## 3. Objectives

1. Provide distinct, accessible workspaces for Creator, school administrators, teachers, and students.
2. Support the examination lifecycle from account setup and question preparation to scheduling, delivery, and results.
3. Allow schools to organize student accounts by class and academic section.
4. Retain approved or saved question content for future examination use.
5. Provide a central way to manage school credits, payments, and support.
6. Make the platform available through web access and role-specific app packages.

## 4. Scope

### Included

- School onboarding and school-specific account access.
- Role-based access for Creator, Admin, Teacher, and Student.
- Teacher and student account management by school administrators.
- Student class and section organization.
- Teacher question authoring, drafts, and approval workflow.
- Exam creation, scheduling, timed delivery, and result recording.
- Archived questions with date-based organization, printing to PDF, and reuse in a future scheduled exam.
- Billing and credit workflows, including Creator-managed pricing and audited adjustments.
- School support conversations and platform-level activity visibility.
- Web, Android, and Windows application delivery paths.

### Exclusions and items requiring agreement

- Migration of historical records from other systems unless separately scoped.
- Custom integrations with external school information systems or learning platforms.
- A guaranteed service-availability level, hosting capacity, or support response time until hosting and service-level requirements are agreed.
- App-store publication, device procurement, school connectivity improvements, and end-user training unless included in the rollout plan.
- Bespoke examination policies, grading rules, or reporting beyond the supported product workflows.

## 5. Users and responsibilities

| Stakeholder | Responsibilities |
|---|---|
| Platform owner / Creator | Configure platform-level credit pricing, manage schools and payment adjustments, monitor platform activity, and respond to school support requests. |
| School Admin | Maintain school accounts and sections, approve teacher submissions, schedule exams, manage billing, and review results. |
| Teacher | Prepare and save subject questions, submit work for approval, and coordinate with the school Admin on exam readiness. |
| Student | Sign in to the school workspace, complete scheduled assessments, and follow school examination instructions. |
| Delivery / operations team | Deploy and monitor the service, protect and back up production data, manage releases, and support onboarding. |

## 6. Proposed delivery plan

The phases below are a planning baseline, not a committed schedule. Confirm the duration and entry criteria with the project owner and participating schools.

| Phase | Indicative duration | Activities and outputs |
|---|---:|---|
| 1. Discovery and readiness | 1 week | Confirm school workflows, roles, exam policies, hosting, payment requirements, data handling, and rollout criteria. |
| 2. Configuration and onboarding preparation | 1 week | Configure school access, initial users and sections, pricing, support procedures, and deployment environments. |
| 3. Workflow validation | 1–2 weeks | Test account administration, question approval, scheduling, student assessment, results, archive reuse, billing, and support with representative users. |
| 4. Pilot rollout | 2 weeks | Onboard a small number of schools, support a controlled assessment cycle, collect feedback, and resolve prioritized issues. |
| 5. Wider rollout and handover | 1 week | Expand onboarding, deliver role-specific app packages and user guidance, and hand over operating procedures. |
| 6. Continuous improvement | Ongoing | Review usage, support requests, service performance, security, backups, and prioritized product improvements. |

## 7. Deliverables

- A deployed school-facing CBT platform with separate Creator, Admin, Teacher, and Student workflows.
- School account, class/section, exam, question, assessment, and results capabilities within the agreed scope.
- Android and Windows application packages for the roles selected for rollout.
- School onboarding and user guidance.
- Operational guidance for deployment, release management, backups, and support.
- Pilot feedback summary and a prioritized follow-up improvement list.

## 8. Acceptance and success measures

Before rollout, project stakeholders should agree on target values and a measurement method for each indicator. Suggested measures include:

- **Workflow completion:** Representative users can complete account setup, question submission and approval, exam scheduling, a student exam, and result review in user-acceptance testing.
- **Exam readiness:** Pilot exams are configured with the intended subjects, schedules, durations, and eligible student sections before the school’s agreed deadline.
- **Assessment integrity:** Test submissions are recorded against the correct student and exam, with the expected score and completion status.
- **Question reuse:** An archived question set can be located, printed to PDF, and reused to create a future scheduled exam without changing the archived source.
- **Access control:** Each role can access only the workflows and data intended for that role and school.
- **Rollout adoption:** Participating schools and users are onboarded against targets agreed during discovery.
- **Operational readiness:** Production monitoring, backup and restore procedures, release ownership, and support escalation paths are documented and tested.

## 9. Assumptions and dependencies

- Schools have compatible devices and sufficiently reliable internet access for the hosted experience.
- School administrators provide accurate account, class, and section information.
- The service owner provisions and maintains suitable production hosting, database storage, backups, and monitoring.
- Payment-provider credentials, pricing decisions, and settlement processes are supplied and approved by the platform owner.
- School examination policies, privacy requirements, and data-retention requirements are confirmed before production rollout.
- Hosted web-interface changes are deployed to the service; Android apps that load the hosted site then receive those changes when reopened or reloaded. Native Android shell changes require a rebuilt APK.
- Desktop application distribution and update releases are managed through the configured desktop release process.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Poor connectivity interrupts access to hosted workflows. | Validate school connectivity during onboarding, communicate requirements, and document an exam-day contingency process. |
| Incorrect student or exam setup affects assessment delivery. | Use administrator review, pilot testing, and pre-exam verification checklists. |
| Account or student information is exposed or misused. | Apply role-based access, use secure production configuration, limit operational access, and define privacy and retention procedures. |
| Data loss or service interruption affects school operations. | Establish monitored backups, test restoration, and document incident ownership and escalation. |
| Payment disputes or incorrect credit adjustments occur. | Reconcile provider records with the platform ledger and retain clear reasons and audit history for adjustments. |
| Users are unfamiliar with digital exam workflows. | Provide role-specific guidance, onboarding sessions, and a supported pilot before wider rollout. |
| Users mistake hosted UI updates for native app updates. | Explain which changes deploy through the website and which require a new app package. |

## 11. Governance and next steps

1. Confirm the project sponsor, participating schools, and decision-makers.
2. Agree on examination policies, privacy and retention requirements, payment operations, and support ownership.
3. Confirm hosting, backup, monitoring, and service-level expectations.
4. Select pilot schools and define acceptance measures and rollout targets.
5. Approve the delivery schedule, app distribution approach, and user-training plan.
6. Begin discovery and readiness checks, then proceed through the proposed phases.

## 12. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Project sponsor |  |  |  |
| Platform owner |  |  |  |
| School representative |  |  |  |
