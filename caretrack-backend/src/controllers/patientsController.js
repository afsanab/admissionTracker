const { query, withTransaction } = require("../db/pool");
const { v4: uuidv4 } = require("uuid");

/**
 * GET /api/patients
 * Returns patients visible to the current user.
 * - Physicians only see their own patients.
 * - Admins see all patients, with optional ?physician= and ?location= filters.
 */
async function listPatients(req, res, next) {
  try {
    const { status, physician, location } = req.query;
    const isPhysician = req.user.role === "physician";

    const conditions = ["p.discharged_at IS NULL"];
    const params = [];
    let idx = 1;

    // Physicians are scoped to their own patients server-side
    if (isPhysician) {
      conditions.push(`p.physician_username = $${idx++}`);
      params.push(req.user.username);
    } else if (physician) {
      conditions.push(`p.physician_username = $${idx++}`);
      params.push(physician);
    }

    if (status) {
      conditions.push(`p.status = $${idx++}`);
      params.push(status);
    }

    if (location) {
      conditions.push(`p.location = $${idx++}`);
      params.push(location);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        p.id, p.first_name, p.last_name, p.dob, p.room,
        p.arrival_at, p.diagnosis, p.notes, p.status,
        p.admit_ts, p.physician_username, p.location,
        p.created_at, p.updated_at
      FROM patients p
      ${where}
      ORDER BY p.created_at DESC
    `;

    const result = await query(sql, params);

    req.audit("LIST_PATIENTS", { count: result.rowCount, filters: { status, physician, location } });

    res.json({ patients: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/patients/:id
 */
async function getPatient(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT p.id, p.first_name, p.last_name, p.dob, p.room,
              p.arrival_at, p.diagnosis, p.notes, p.status,
              p.admit_ts, p.physician_username, p.location,
              p.created_at, p.updated_at
       FROM patients p
       WHERE p.id = $1 AND p.discharged_at IS NULL`,
      [id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Patient not found." });
    }

    const patient = result.rows[0];

    // Physicians can only see their own patients
    if (req.user.role === "physician" && patient.physician_username !== req.user.username) {
      return res.status(403).json({ error: "Access denied." });
    }

    req.audit("READ_PATIENT", { patientId: id });

    res.json({ patient });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/patients
 * Both roles can create patients.
 */
async function createPatient(req, res, next) {
  try {
    const {
      firstName, lastName, dob, room, arrivalAt,
      diagnosis, notes, status = "pending",
      physicianUsername, location,
    } = req.body;

    if (!firstName || !lastName || !dob) {
      return res.status(400).json({ error: "firstName, lastName, and dob are required." });
    }

    const id = uuidv4();
    const admitTs = status === "inhouse" ? new Date() : null;

    const result = await query(
      `INSERT INTO patients
         (id, first_name, last_name, dob, room, arrival_at, diagnosis, notes,
          status, admit_ts, physician_username, location, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [id, firstName, lastName, dob, room || null, arrivalAt || null,
       diagnosis || null, notes || null, status, admitTs,
       physicianUsername || null, location || null, req.user.id]
    );

    req.audit("CREATE_PATIENT", { patientId: id });

    res.status(201).json({ patient: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/patients/:id
 * Admins can edit all fields. Physicians cannot edit (per app design).
 */
async function updatePatient(req, res, next) {
  try {
    const { id } = req.params;

    // Only admins can edit patient records
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admissions staff can edit patient records." });
    }

    const existing = await query(
      "SELECT * FROM patients WHERE id = $1 AND discharged_at IS NULL", [id]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Patient not found." });
    }

    const p = existing.rows[0];
    const {
      firstName = p.first_name,
      lastName = p.last_name,
      dob = p.dob,
      room = p.room,
      arrivalAt = p.arrival_at,
      diagnosis = p.diagnosis,
      notes = p.notes,
      status = p.status,
      physicianUsername = p.physician_username,
      location = p.location,
    } = req.body;

    // Auto-set admit_ts if transitioning to inhouse
    let admitTs = p.admit_ts;
    if (p.status !== "inhouse" && status === "inhouse" && !admitTs) {
      admitTs = new Date();
    }

    const result = await query(
      `UPDATE patients SET
         first_name = $1, last_name = $2, dob = $3, room = $4,
         arrival_at = $5, diagnosis = $6, notes = $7, status = $8,
         admit_ts = $9, physician_username = $10, location = $11,
         updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [firstName, lastName, dob, room, arrivalAt, diagnosis, notes,
       status, admitTs, physicianUsername, location, id]
    );

    req.audit("UPDATE_PATIENT", { patientId: id, changes: req.body });

    res.json({ patient: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/patients/:id/admit
 * Promote a pending patient to In House — admin only.
 * This triggers task creation (handled by DB trigger or resolved by client).
 */
async function admitPatient(req, res, next) {
  try {
    const { id } = req.params;

    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admissions staff can admit patients." });
    }

    const result = await query(
      `UPDATE patients
       SET status = 'inhouse', admit_ts = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'pending' AND discharged_at IS NULL
       RETURNING *`,
      [id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Patient not found or already admitted." });
    }

    req.audit("ADMIT_PATIENT", { patientId: id });

    res.json({ patient: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/patients/:id/discharge
 * Discharge patient and cancel all open tasks — admin only.
 */
async function dischargePatient(req, res, next) {
  try {
    const { id } = req.params;

    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admissions staff can discharge patients." });
    }

    await withTransaction(async (client) => {
      // Mark patient discharged (soft delete)
      const result = await client.query(
        `UPDATE patients
         SET status = 'discharged', discharged_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND discharged_at IS NULL
         RETURNING id`,
        [id]
      );

      if (!result.rows[0]) {
        const err = new Error("Patient not found or already discharged.");
        err.status = 404;
        throw err;
      }

      // Cancel all non-completed tasks
      await client.query(
        `UPDATE tasks
         SET status = 'cancelled', updated_at = NOW()
         WHERE patient_id = $1 AND status NOT IN ('completed', 'cancelled')`,
        [id]
      );
    });

    req.audit("DISCHARGE_PATIENT", { patientId: id });

    res.json({ message: "Patient discharged and open tasks cancelled." });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/patients/:id
 * Hard delete — only for pending patients (no PHI in house yet), admin only.
 */
async function deletePatient(req, res, next) {
  try {
    const { id } = req.params;

    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admissions staff can remove patients." });
    }

    const result = await query(
      "DELETE FROM patients WHERE id = $1 AND status = 'pending' RETURNING id",
      [id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Patient not found or cannot be deleted (use discharge for admitted patients)." });
    }

    req.audit("DELETE_PATIENT", { patientId: id });

    res.json({ message: "Pending patient removed." });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPatients, getPatient, createPatient,
  updatePatient, admitPatient, dischargePatient, deletePatient,
};
