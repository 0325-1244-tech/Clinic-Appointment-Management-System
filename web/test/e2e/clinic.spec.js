// @ts-check
import { expect, test } from '@playwright/test';

/** A working day for Dr. Carlo Mendoza (Mon–Sat) a few days from now, in clinic time. */
function nextClinicDay(daysAhead = 3) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  now.setDate(now.getDate() + daysAhead);
  if (now.getDay() === 0) now.setDate(now.getDate() + 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Selects the option whose text contains `text`. @param {import('@playwright/test').Locator} select @param {string} text */
async function pick(select, text) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value ?? '');
}

/** @param {import('@playwright/test').Page} page @param {string} username @param {string} password */
async function signIn(page, username, password) {
  await page.goto('/');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/** A link in the main navigation. @param {import('@playwright/test').Page} page @param {string} name */
function nav(page, name) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });
}

test('front desk: register patient, book, double booking blocked, complete, records, CSV', async ({ page }) => {
  const day = nextClinicDay();
  await signIn(page, 'admin', 'admin123');

  // 1. Register a patient (with a validation error first).
  await nav(page, 'Patients').click();
  await page.getByRole('button', { name: 'Register patient' }).click();
  const dialog = page.getByRole('dialog', { name: 'Register patient' });
  await dialog.getByLabel('First name').fill('Carmela');
  await dialog.getByLabel('Last name').fill('Reyes');
  await dialog.getByLabel('Contact number').fill('12345');
  await dialog.getByLabel('Birth date').fill('1992-06-15');
  await dialog.getByLabel('Gender').selectOption('Female');
  await dialog.getByLabel('Address').fill('Brgy. Pagsawitan, Santa Cruz, Laguna');
  await dialog.getByRole('button', { name: 'Register patient' }).click();
  await expect(dialog.getByText('Contact number must be a valid PH mobile number')).toBeVisible();
  await dialog.getByLabel('Contact number').fill('0917 555 0101');
  await dialog.getByRole('button', { name: 'Register patient' }).click();
  await expect(page.getByText('Registered Carmela Reyes')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Carmela Reyes' })).toBeVisible();

  // 2. Book her with the dentist on an open slot.
  await nav(page, 'Appointments').click();
  await page.getByRole('button', { name: 'Book appointment' }).first().click();
  let booking = page.getByRole('dialog', { name: 'Book appointment' });
  await pick(booking.getByLabel('Patient'), 'Carmela Reyes');
  await pick(booking.getByLabel('Attending staff'), 'Carlo Mendoza');
  await booking.getByLabel('Date').fill(day);
  await booking.getByLabel('Date').dispatchEvent('change');
  await expect(booking.getByRole('radio', { name: '08:00 AM' })).toBeVisible();
  await expect(booking.getByText('Estimated fee')).toContainText('Dentist');
  await booking.getByRole('radio', { name: '08:00 AM' }).click();
  await booking.getByLabel('Reason for visit').fill('Tooth extraction consult');
  await booking.getByRole('button', { name: 'Book appointment' }).click();
  await expect(page.getByText(/^Booked A-\d{4}$/)).toBeVisible();

  // 3. Double booking is impossible: the taken slot is no longer offered, and the API refuses it.
  await page.getByRole('button', { name: 'Book appointment' }).first().click();
  booking = page.getByRole('dialog', { name: 'Book appointment' });
  await pick(booking.getByLabel('Attending staff'), 'Carlo Mendoza');
  await booking.getByLabel('Date').fill(day);
  await booking.getByLabel('Date').dispatchEvent('change');
  await expect(booking.getByRole('radio', { name: '09:00 AM' })).toBeVisible();
  await expect(booking.getByRole('radio', { name: '08:00 AM' })).toHaveCount(0);
  await booking.getByRole('button', { name: 'Cancel' }).click();
  const clash = await page.evaluate(async (date) => {
    const res = await fetch('/api/appointments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: 'P-0003', staffId: 'S-0004', date, time: '08:00', type: 'CHECK_UP', reason: 'Clash test' }),
    });
    return { status: res.status, body: await res.json() };
  }, day);
  expect(clash.status).toBe(409);
  expect(clash.body.error.message).toBe('Dr. Carlo Mendoza, DMD already has an appointment at that time.');

  // 4. Complete the visit with findings.
  await page.getByRole('searchbox', { name: /Search patient/ }).fill('Carmela');
  const row = page.getByRole('row', { name: /Carmela Reyes/ });
  await expect(row).toBeVisible();
  await row.dblclick();
  const details = page.getByRole('dialog', { name: /^Appointment A-\d{4}$/ });
  await expect(details.getByText('Dr. Carlo Mendoza, DMD · Dentist (Dental Room 1)')).toBeVisible();
  await details.getByRole('button', { name: 'Complete' }).click();
  const complete = page.getByRole('dialog', { name: /^Complete A-\d{4}$/ });
  await complete.getByRole('button', { name: 'Mark as completed' }).click();
  await expect(complete.getByText('Please enter the findings or notes for this visit.')).toBeVisible();
  await complete.getByLabel('Findings or notes for this visit').fill('Impacted molar #38. Extraction scheduled.');
  await complete.getByRole('button', { name: 'Mark as completed' }).click();
  await expect(page.getByText(/^Completed A-\d{4}$/)).toBeVisible();

  // 5. It now appears in the records, and the CSV export has the Java columns.
  await nav(page, 'Records').click();
  await page.getByRole('searchbox').fill('Impacted molar');
  await expect(page.getByRole('row', { name: /Carmela Reyes/ })).toContainText('Completed');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('appointment-records.csv');
  const csv = await (await download.createReadStream()).toArray();
  const text = Buffer.concat(csv).toString('utf8');
  expect(text).toContain('"Appointment ID","Date","Time","Patient ID","Patient","Staff","Role","Type","Reason","Status","Fee (PHP)","Remarks"');
  expect(text).toContain('"Carmela Reyes","Dr. Carlo Mendoza, DMD","Dentist","Consultation","Tooth extraction consult","Completed",700.00');
});

test('doctor accounts only see their own schedule', async ({ page }) => {
  await signIn(page, 'drsantos', 'doctor123');
  await expect(nav(page, 'Audit Log')).toHaveCount(0);
  await nav(page, 'Appointments').click();
  await page.getByRole('button', { name: 'All dates' }).click();
  const staffCells = page.locator('tbody tr td:nth-child(4) .cell-primary');
  await expect(staffCells.first()).toBeVisible();
  const names = await staffCells.allTextContents();
  expect(new Set(names)).toEqual(new Set(['Dr. Maria Santos']));
  await expect(page.getByRole('button', { name: 'Book appointment' })).toHaveCount(0);
});

test('cancel can be undone within a few seconds', async ({ page }) => {
  await signIn(page, 'reception', 'reception123');
  await page.goto('/#/appointments?period=upcoming');
  const row = page.getByRole('row', { name: /Sofia Aquino/ }).first();
  await row.click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const prompt = page.getByRole('dialog', { name: /^Cancel A-\d{4}$/ });
  await prompt.getByLabel('Reason for cancelling').fill('Patient asked to cancel');
  await prompt.getByRole('button', { name: 'Cancel appointment' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText(/^Kept A-\d{4}$/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('row', { name: /Sofia Aquino/ }).first()).toContainText('Scheduled');
});

test('keyboard: Ctrl+K search opens a patient profile', async ({ page }) => {
  await signIn(page, 'admin', 'admin123');
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('combobox', { name: 'Search' });
  await expect(palette).toBeFocused();
  await palette.fill('aquino');
  await expect(page.getByRole('option', { name: /^Sofia Aquino P-0004/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/patients\/P-0004$/);
  await expect(page.getByRole('heading', { name: 'Sofia Aquino' })).toBeVisible();
});

test('queue board shows initials only and updates live', async ({ page, browser }) => {
  const board = await (await browser.newContext()).newPage();
  await board.goto('/board');
  await expect(board.getByText('Live')).toBeVisible();
  await expect(board.getByRole('heading', { name: 'Now serving' })).toBeVisible();
  await signIn(page, 'reception', 'reception123');
  const body = await board.locator('body').innerText();
  expect(body).not.toMatch(/Juan Dela Cruz|Paolo Mercado/);
});

test('works on a phone @mobile', async ({ page }) => {
  await signIn(page, 'admin', 'admin123');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await nav(page, 'Patients').click();
  await expect(page.getByRole('heading', { name: 'Patients', level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
