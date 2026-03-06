# CareTrack — Nursing Home Admissions & Task Management

CareTrack is a HIPAA-aware clinical workflow tool designed to streamline patient admissions tracking and physician task management across one or more skilled nursing facilities. It provides a unified view for both admissions staff and attending physicians, reducing communication gaps and ensuring time-sensitive clinical tasks don't fall through the cracks.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 (functional components, hooks) |
| Language | JavaScript (JSX) |
| Styling | Inline styles (no external CSS framework) |
| State Management | React `useState` |
| Rendering | Client-side only (single-page application) |
| Hosting | Deployable as a static React app (Vite, Create React App, or similar) |
| Future Backend | Node.js / Express + HIPAA-compliant database (e.g. AWS RDS on GovCloud) |
| Future EHR Integration | PointClickCare FHIR API / MatrixCare API |

---

## End Users

**Admissions Staff**
Administrative personnel at skilled nursing facilities who manage the patient census, handle intake paperwork, and coordinate with the attending physician. They are the primary data entry users and task assigners.

**Attending Physicians**
Physicians who cover one or more nursing home facilities. They use CareTrack to view their patient census across all facilities, receive assigned clinical tasks, and document task completion — all from a single unified view.

---

## Purpose

In skilled nursing facilities, clinical documentation tasks like History & Physicals, 30-day reviews, and 60-day reviews are regulatory requirements with strict deadlines. These tasks are typically coordinated informally via phone calls, sticky notes, or separate EHR systems that don't offer a simple at-a-glance workflow view.

CareTrack solves this by providing a lightweight, mobile-friendly interface where:
- Admissions staff can track incoming and current patients across facilities
- Physicians can see all their patients in one place, regardless of which facility they're at
- Required clinical tasks are automatically generated, tracked, and flagged when overdue

---

## Functionality & Features

### Authentication & Role-Based Access
- Dual-role login: **Physician** and **Admissions Staff**
- Role-specific views and permissions — admissions staff manage records, physicians manage task completion
- Both roles can add new patient admissions

### Patient Admission Management
- Add, edit, and track patients with fields for name, DOB, room, diagnosis, attending physician, facility, clinical notes, and admission status
- Two status states: **Pending** (expected arrival) and **In House** (admitted)
- Admissions staff can promote a patient from Pending to In House, which automatically triggers clinical task creation
- Admissions staff can **Discharge** a patient, removing them from the active census and cancelling any outstanding tasks

### Automated Clinical Task System
Tasks are automatically created when a patient is marked In House, based on regulatory timing requirements:

| Task | Appears | Due |
|---|---|---|
| H & P | On admission | 48 hours after admit |
| 30-Day Review | Day 21 | Day 30 |
| 60-Day Review | Day 51 | Day 60, then repeats every 60 days |

- Admissions staff **assign** tasks to the physician, optionally adding instructions or context
- Physicians **mark tasks complete** from their view
- Overdue tasks are prominently flagged with red indicators on cards and in the stats bar
- Tasks are automatically cancelled upon patient discharge

### Multi-Facility Support
- Patients can be assigned to different nursing home facilities
- Physicians see all their patients across all facilities in one unified list
- Facility filter dropdown allows physicians to narrow to a specific location
- Admissions staff can filter by both facility and physician

### Filtering & Navigation
- Filter patients by status (All / Pending / In House)
- Filter by attending physician (admin view)
- Filter by facility/location (both views)
- Clickable stat cards (Pending, In House, Open Tasks, Overdue Tasks) instantly filter the patient list

### Patient Cards
Each patient card displays:
- Name, DOB/age, room number, facility, attending physician, diagnosis, and clinical notes
- Inline task status pills showing each task's state (unassigned, assigned, overdue, complete)
- Color-coded card borders and headers reflecting urgency (green = stable, yellow = pending, red = overdue tasks)

### Mobile-Responsive Design
- Single-column layout optimized for iPhone and Android screens
- Touch-friendly button sizing and form inputs
- Full-width modals with scrollable forms for comfortable mobile data entry

---

## HIPAA Considerations

This prototype runs entirely client-side and is intended as a design and workflow prototype only. A production deployment would require:

- HIPAA-compliant backend and database (e.g. AWS GovCloud, Azure with HIPAA BAA)
- Encryption at rest and in transit (TLS 1.2+)
- Audit logging for all PHI access and modifications
- Real authentication with session timeouts and MFA
- Signed Business Associate Agreements (BAAs) with all vendors
- Role-based access control enforced server-side

---

## Planned Integrations

- **PointClickCare FHIR API** — automatic admission sync from the facility EHR ($65/facility/month)
- **MatrixCare API** — alternative EHR integration for facilities on the MatrixCare platform
- Real-time push notifications for task assignments and overdue alerts

---

## Project Status

Current build is a **functional frontend prototype** demonstrating the full intended workflow. Backend infrastructure, persistent data storage, and EHR integrations are planned for the production version.