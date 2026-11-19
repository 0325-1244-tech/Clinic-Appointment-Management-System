# CareConnect: Video Presentation Script

**Target length:** about 9 minutes 30 seconds (the requirement is 7–10 minutes, including a 3-minute demo).
**Speakers:** Lovelyn Genovania, Jun Dave Ofrin, Yyah Jannah Pacia, Andrei Joseph Palis.

| Time | Part | Speaker | On screen |
|---|---|---|---|
| 0:00–0:30 | 1. Title and group members | Lovelyn | Slide 1 |
| 0:30–1:20 | 2. Project overview | Lovelyn | Slides 2–3 |
| 1:20–2:00 | 3. Project objectives | Lovelyn | Slide 4 |
| 2:00–3:00 | 4. Class diagram explanation | Jun Dave | Slides 5–6 (class diagrams) |
| 3:00–4:00 | 5a. Inheritance and Abstraction | Jun Dave | Slide 7, then the code |
| 4:00–5:30 | 5b. Encapsulation and Polymorphism | Yyah Jannah | Slides 8–9, then the code |
| 5:30–8:30 | 6. System demonstration (3 minutes) | Andrei | Screen recording of the live site |
| 8:30–9:30 | 7. Conclusion and contributions | All four | Slide 10, cameras on |

Lines in *italics* are actions, not words to say. A normal speaking pace is about 130–140 words a minute;
each part's script fits its time slot at that pace. Practise once with a timer before recording.

---

## Before recording: checklist

**Live site:** https://careconnect-web-qwno.onrender.com

The free server sleeps when nobody uses it. Open the site **two minutes before** recording so it is awake.

Sign in as `admin` and prepare this data first, so the demo does not waste time on typing:

1. **Medical Staff → Add staff**:
   - A **Doctor**, e.g. Dr. Maria Santos, General Medicine, Monday–Saturday, 08:00–17:00.
   - A **Dentist**, e.g. Dr. Jose Reyes, Dental Room 1, Monday–Saturday, 08:00–17:00.
   - A **Nurse**, e.g. Ana Cruz, Triage, Monday–Friday, 08:00–12:00.
2. **Patients → Register patient**: register **two** patients (you will register a third one live).
3. **Appointments → Book appointment**: book one appointment **for today** with the Doctor, and one for
   tomorrow, so the dashboard and the queue are not empty.
4. **Accounts → New account**: create a **Doctor** account linked to the Doctor above (for example
   username `drsantos`). Use a password of at least 10 characters.
5. Open a **second browser window** (Incognito / InPrivate) and sign in there with the doctor account.
6. In VS Code (or on GitHub), open these files in tabs, in this order:
   `web/src/domain/Person.js`, `MedicalStaff.js`, `Doctor.js`, `Dentist.js`, `Nurse.js`, `Appointment.js`,
   and `web/src/services/ClinicService.js`.
7. Open `docs/class-diagram.html` in the browser for the class diagram, or put the diagrams on the slides.

> Recording on a laptop instead of the live site? Run `npm run demo` inside `web/`. It loads sample
> patients and staff and the demo accounts (`admin` / `admin123`, `drsantos` / `doctor123`).

---

## 1. Title and group members (0:00–0:30): Lovelyn

> Good day, Ma'am/Sir. We are presenting our final project in Object-Oriented Programming:
> **CareConnect, a Clinic Appointment Management System.** This is Scenario 3.
>
> Our group members are: I am **Lovelyn Genovania**; with me are **Jun Dave Ofrin**, **Yyah Jannah Pacia**,
> and **Andrei Joseph Palis**. Our instructor allowed us to have four members.

## 2. Project overview (0:30–1:20): Lovelyn

> Many small clinics and school infirmaries still use paper logbooks or spreadsheets for appointments.
> This causes real problems: two patients get booked with the same doctor at the same time, appointments
> land on a doctor's day off, past visits and findings get lost, and fees are computed by hand, so they
> are not always the same.
>
> CareConnect solves this. It is a web application that anyone in the clinic can open in a browser.
> It registers patients, keeps a list of doctors, dentists and nurses with their schedules, books
> appointments using **only open time slots**, tracks each appointment until it is completed, cancelled
> or marked as a no-show, computes the fee automatically, and keeps a history of every visit.
>
> We first built it in Java Swing, then rebuilt it as a web system in JavaScript with Node.js, so it is
> now online and stores its data in a PostgreSQL database.

## 3. Project objectives (1:20–2:00): Lovelyn

> Our **general objective** is to develop a web-based clinic appointment system that applies the four
> pillars of OOP, Encapsulation, Inheritance, Polymorphism and Abstraction, to make clinic scheduling
> faster and more reliable.
>
> Our **specific objectives** are to:
> one, register and validate patients;
> two, manage doctors, dentists and nurses with their working days and shifts;
> three, book appointments without double booking;
> four, track each appointment's status;
> five, compute fees automatically;
> six, keep appointment records that can be exported;
> and seven, protect the data with sign-in and user roles.
>
> Now Jun Dave will explain our class diagram.

## 4. Class diagram explanation (2:00–3:00): Jun Dave

*Show the class diagram for people and medical staff.*

> This is our UML class diagram. A minus sign means private, a plus sign means public, and an asterisk
> marks an abstract method. The diagram matches our real code; we even have a script,
> `npm run check:diagrams`, that checks every class and member in the diagram against the source code.
>
> At the top is the abstract class **Person**, with private attributes such as ID, first name, last
> name and contact number. **Patient** and **MedicalStaff** extend Person. MedicalStaff is also abstract,
> and it has three concrete subclasses: **Doctor**, **Dentist** and **Nurse**.
>
> *Show the appointment diagram.*
>
> An **Appointment** is associated with exactly one Patient and one MedicalStaff. It also uses two
> enumerations, **AppointmentStatus** and **AppointmentType**, and it fulfils three contracts:
> Identifiable, Billable and Searchable. The **ClinicService** class holds all the business rules and
> stores data through **Repository** classes. The diagram has about one hundred classes in all, including the
> pages and dialogs of the user interface.

## 5a. Inheritance and Abstraction (3:00–4:00): Jun Dave

*Show `Doctor.js` and `MedicalStaff.js`.*

> **Inheritance.** `class Doctor extends MedicalStaff`, and `MedicalStaff extends Person`. The constructor
> calls `super(...)`, so a Doctor reuses everything a Person has (the ID, the name, contact
> validation) and everything a staff member has (license number, working days and shift), and only adds
> what is special to a doctor: the specialization. Dentist and Nurse work the same way.
>
> **Abstraction.** JavaScript has no `abstract` keyword, so we built it ourselves. In the Person
> constructor, `if (new.target === Person)` throws an error, so nobody can create a plain Person, only a
> Patient or a staff member. MedicalStaff declares `getConsultationFee()` but does not implement it: it
> throws "must be implemented" until a subclass overrides it. The rest of the system only needs to know
> that every staff member *has* a fee, not how it is computed.
>
> Yyah will continue with Encapsulation and Polymorphism.

## 5b. Encapsulation and Polymorphism (4:00–5:30): Yyah Jannah

*Show `Person.js`.*

> **Encapsulation.** Our fields are private, using JavaScript's `#` syntax, like `#id` and
> `#contactNumber`. Code outside the class cannot touch them directly. It must go through getters and
> setters, and the setters validate. For example, the `contactNumber` setter removes spaces and rejects
> anything that is not a valid Philippine mobile number. The ID has a getter but no setter, so it can never
> change.
>
> *Show `Appointment.js`.*
>
> The best example is the Appointment status. There is a `get status()` but **no** setter. The status
> can only change through the methods `complete()`, `cancel()`, `markNoShow()` and `reschedule()`, and
> each of them first calls the private method `#ensureScheduled()`. So a cancelled appointment can never be
> completed by mistake.
>
> *Show `Doctor.js`, `Dentist.js` and `Nurse.js` side by side.*
>
> **Polymorphism.** Each subclass overrides `getConsultationFee()` in its own way: a general doctor is
> 500 pesos and a specialist 800, a dentist 700, and a nurse 250. Each also has its own slot length:
> 30, 60 and 15 minutes. When an appointment computes its fee, it simply calls
> `staff.getConsultationFee()` without checking what kind of staff it is, and the right version runs.
> The fee is then multiplied by the appointment type: Consultation times one, Follow-up times 0.6,
> Check-up times 0.8, and Emergency times 1.5.
>
> *Show `ClinicService.js`, `findAppointments`.*
>
> JavaScript has no method overloading, so `findAppointments` checks what it receives, whether a date, a
> patient, a staff member, a status or a keyword, and runs the matching search. Over to Andrei for
> the demonstration.

## 6. System demonstration (5:30–8:30): Andrei

*Screen recording of the live site, signed in as `admin`. Keep talking while you click.*

**5:30 Dashboard (20 s)**

> This is CareConnect online. After signing in as the administrator we see the dashboard: the number of
> patients, active staff, today's appointments, the fees collected, and the staff on duty today.

**5:50 Register a patient (40 s)**

*Patients → **Register patient**. Type a contact number such as `12345`.*

> Let's register a new patient. If I type a wrong contact number, the form stops me right away. This
> message comes from the same Person class Yyah showed earlier. *Fix it to `09171234567`, fill in the
> rest, Save.* The patient is saved and gets a patient ID automatically.

**6:30 Book an appointment (50 s)**

*Appointments → **Book appointment**. Choose the new patient, the **Dentist**, tomorrow's date, Consultation.*

> Now I book this patient with the dentist. Notice that the system shows **only the open time slots**,
> in 60-minute steps, because that is the dentist's slot length. The estimated fee is 700 pesos: that is the
> Dentist's overridden `getConsultationFee()`, which is polymorphism in action. *Pick a slot, Save.*
>
> *Open **Book appointment** again for a different patient, same dentist and date.*
>
> If another patient tries the same dentist on the same day, the slot I just took is **no longer
> offered**, so double booking is impossible.

**7:20 Complete the visit and view records (40 s)**

*Select the appointment → **Complete**, type findings, Save. Open **Records**.*

> When the visit is done, the staff completes the appointment and records the findings. It now moves to
> **Records**, the history of completed, cancelled and no-show visits, with the totals. We can also
> export it with **Export CSV**.

**8:00 Roles and queue (30 s)**

*Switch to the second window, signed in as the doctor.*

> Finally, security. This is the doctor's account. A doctor sees **only their own** appointments and
> patients, and has no access to accounts or the audit log. *Back to admin: open **Queue**, then **Open
> queue board**.* The clinic can also show this live "now serving" board in the waiting area.

## 7. Conclusion (8:30–9:30): all four

*Slide 10. Each member says one or two sentences.*

**Lovelyn:**
> In conclusion, CareConnect solves the real problems of a clinic's paper logbook: no double booking,
> automatic fees, and a complete history of every visit. My part was the project overview and objectives,
> patient registration, and the documentation.

**Jun Dave:**
> I built the medical personnel classes, Person, MedicalStaff, Doctor, Dentist and Nurse, and the UML
> class diagrams. I learned how inheritance and abstraction let us add a new kind of staff without
> changing the rest of the system.

**Yyah Jannah:**
> I worked on the Appointment class, the scheduling rules, the fee computation and the automated tests,
> nearly two hundred of them, which check every business rule.

**Andrei:**
> I built the web interface, the sign-in and roles, and deployed the system online on Render with a
> Neon database. Thank you for watching. The source code is on our GitHub, and the system is live
> at the link in our description.

---

## Slide outline for Canva

| # | Slide | Content |
|---|---|---|
| 1 | Title | "CareConnect: Clinic Appointment Management System", Scenario 3, OOP Final Project, LSPU, four member names |
| 2 | The problem | Double booking, bookings outside working hours, lost records, hand-computed fees, no overview |
| 3 | Our solution | Screenshot of the dashboard (`docs/screenshots/dashboard.png`) and 4–5 key features |
| 4 | Objectives | General objective plus the seven specific objectives |
| 5 | Class diagram (1) | Person → Patient, MedicalStaff → Doctor / Dentist / Nurse |
| 6 | Class diagram (2) | Appointment, AppointmentStatus / AppointmentType, ClinicService, Repository |
| 7 | Inheritance and Abstraction | `extends` / `super`; `new.target` guard; abstract `getConsultationFee()` |
| 8 | Encapsulation | `#private` fields; validating setter; status with no setter |
| 9 | Polymorphism | Fee table: Doctor ₱500 / ₱800, Dentist ₱700, Nurse ₱250; type multipliers |
| 10 | Conclusion | Summary, each member's contribution, GitHub link and live-site link |

Screenshots for the slides are in `docs/screenshots/`. The class diagrams are in `docs/class-diagram.html`
and in the Word documentation (`docs/CareConnect-Documentation.docx`).

## Recording tips

- Record with Zoom, Google Meet or OBS, with each speaker's camera on during their part.
- Record the demo as a separate 3-minute screen recording, then join everything in CapCut or Canva.
- Upload to YouTube as **Unlisted** (or Public), and open the link in a private window to make sure it plays
  without signing in.
