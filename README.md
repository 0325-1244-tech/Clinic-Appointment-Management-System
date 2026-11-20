# CareConnect

Clinic Appointment Management System: a web app for patient registration, medical staff, appointment scheduling and visit records. Final project for Object-Oriented Programming (Scenario 3), Laguna State Polytechnic University.

**Live:** https://careconnect-web-qwno.onrender.com (the free server sleeps when idle, so the first load can take about a minute)

## Features

Patients, medical staff (Doctor, Dentist, Nurse), appointment booking with no double booking, automatic fees, calendar, queue board, visit records with CSV export, audit log, and sign-in with Admin, Receptionist and Doctor roles.

## Run locally

Requires Node.js 24 or newer.

```
cd web
npm install
npm run demo
```

Open http://localhost:3000. Demo accounts: admin / admin12345, reception / helloworld123, dr.mendoza / helloworld123, dr.ramos / helloworld123.

For real use, start with an empty clinic:

```
ADMIN_USERNAME=owner ADMIN_PASSWORD='choose-a-long-password' npm start
```

Set DATABASE_URL to store data in PostgreSQL (for example Neon). Deployment to Render is configured in render.yaml.

## Tests

```
cd web
npm test
npm run verify
```

## Structure

```
web/    JavaScript web app (Node.js, Express, vanilla JS)
src/    Original Java Swing version
docs/   Class diagrams and screenshots
```

## Group members

Lovelyn Genovania, Jun Dave Ofrin, Yyah Jannah Pacia, Andrei Joseph Palis
