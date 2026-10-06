const express = require("express");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");

const app = express();
app.use(express.json()); // Parse JSON request bodies

const PORT = 5000;

// The JSON file where we store courses
const DATA_FILE = path.join(__dirname, "courses.json");

/**
 * Ensure the data file exists.
 * If it doesn't exist, create it with an empty array [].
 */
async function ensureDataFileExists() {
  try {
    await fsp.access(DATA_FILE, fs.constants.F_OK);
    // If access succeeds, file exists.
  } catch (err) {
    // If access fails, file likely doesn't exist yet => create it.
    await fsp.writeFile(DATA_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

/**
 * Read courses from the JSON file.
 * Returns an array of course objects.
 */
async function readCourses() {
  // Read file contents as a string, then parse as JSON.
  const raw = await fsp.readFile(DATA_FILE, "utf8");
  const courses = JSON.parse(raw);
  // Defensive: ensure we always return an array.
  return Array.isArray(courses) ? courses : [];
}

/**
 * Write courses array back to the JSON file.
 */
async function writeCourses(courses) {
  await fsp.writeFile(DATA_FILE, JSON.stringify(courses, null, 2), "utf8");
}

/**
 * Validate status value against allowed values.
 */
function isValidStatus(status) {
  const allowed = ["Not Started", "In Progress", "Completed"];
  return allowed.includes(status);
}

/**
 * Validate target_date format: YYYY-MM-DD
 * (Simple regex check for beginner friendliness)
 */
function isValidDateFormat(dateStr) {
  // Matches: 2024-01-31 etc.
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(dateStr)) return false;

  // Optional: further validate that it's a real calendar date
  const d = new Date(dateStr);
  return !Number.isNaN(d.getTime());
}

/**
 * Get the next id by looking at existing courses.
 * Starts at 1.
 */
function getNextId(courses) {
  if (courses.length === 0) return 1;
  const maxId = Math.max(...courses.map((c) => c.id));
  return maxId + 1;
}

/* -------------------- ROUTES -------------------- */

/**
 * POST /api/courses
 * Add a new course
 */
app.post("/api/courses", async (req, res) => {
  try {
    const { name, description, target_date, status } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: "Missing required field: name" });
    }
    if (!description) {
      return res.status(400).json({ error: "Missing required field: description" });
    }
    if (!target_date) {
      return res.status(400).json({ error: "Missing required field: target_date" });
    }
    if (!status) {
      return res.status(400).json({ error: "Missing required field: status" });
    }

    // Validate status enum
    if (!isValidStatus(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: "Not Started", "In Progress", "Completed"',
      });
    }

    // Validate date format YYYY-MM-DD
    if (!isValidDateFormat(target_date)) {
      return res.status(400).json({
        error: 'Invalid target_date. Must be in format YYYY-MM-DD (e.g. 2026-12-31)',
      });
    }

    // Read existing courses from file
    const courses = await readCourses();

    // Create new course object
    const newCourse = {
      id: getNextId(courses), // auto-generated starting from 1
      name,
      description,
      target_date,
      status,
      created_at: new Date().toISOString(), // auto-generated timestamp
    };

    // Save to file
    courses.push(newCourse);
    await writeCourses(courses);

    return res.status(201).json(newCourse);
  } catch (err) {
    console.error("POST /api/courses error:", err);
    return res.status(500).json({ error: "File read/write error" });
  }
});

/**
 * GET /api/courses
 * Get all courses
 */
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await readCourses();
    return res.json(courses);
  } catch (err) {
    console.error("GET /api/courses error:", err);
    return res.status(500).json({ error: "File read/write error" });
  }
});

/**
 * GET /api/courses/
 * Get a specific course
 * Note: Your requirement says "/api/courses/" but also "Get a specific course".
 * We'll interpret it as: GET /api/courses/:id
 */
app.get("/api/courses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid course id" });
    }

    const courses = await readCourses();
    const course = courses.find((c) => c.id === id);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    return res.json(course);
  } catch (err) {
    console.error("GET /api/courses/:id error:", err);
    return res.status(500).json({ error: "File read/write error" });
  }
});

/**
 * PUT /api/courses/
 * Update a course
 * We'll interpret as: PUT /api/courses/:id (replace course fields)
 */
app.put("/api/courses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid course id" });
    }

    const { name, description, target_date, status } = req.body;

    // Validate required fields (for PUT we expect all required fields)
    if (!name) {
      return res.status(400).json({ error: "Missing required field: name" });
    }
    if (!description) {
      return res.status(400).json({ error: "Missing required field: description" });
    }
    if (!target_date) {
      return res.status(400).json({ error: "Missing required field: target_date" });
    }
    if (!status) {
      return res.status(400).json({ error: "Missing required field: status" });
    }

    // Validate status enum
    if (!isValidStatus(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: "Not Started", "In Progress", "Completed"',
      });
    }

    // Validate date format YYYY-MM-DD
    if (!isValidDateFormat(target_date)) {
      return res.status(400).json({
        error: 'Invalid target_date. Must be in format YYYY-MM-DD (e.g. 2026-12-31)',
      });
    }

    const courses = await readCourses();
    const index = courses.findIndex((c) => c.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Keep created_at unchanged; update other fields
    const updatedCourse = {
      ...courses[index],
      name,
      description,
      target_date,
      status,
    };

    courses[index] = updatedCourse;
    await writeCourses(courses);

    return res.json(updatedCourse);
  } catch (err) {
    console.error("PUT /api/courses/:id error:", err);
    return res.status(500).json({ error: "File read/write error" });
  }
});

/**
 * DELETE /api/courses/
 * Delete a course
 * We'll interpret as: DELETE /api/courses/:id
 */
app.delete("/api/courses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid course id" });
    }

    const courses = await readCourses();
    const index = courses.findIndex((c) => c.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Remove the course and save back
    const deleted = courses.splice(index, 1)[0];
    await writeCourses(courses);

    return res.json({ message: "Course deleted", deleted });
  } catch (err) {
    console.error("DELETE /api/courses/:id error:", err);
    return res.status(500).json({ error: "File read/write error" });
  }
});

/* -------------------- START SERVER -------------------- */
ensureDataFileExists()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CodeCraftHub API running on http://localhost:${PORT}`);
      console.log(`Data file: ${DATA_FILE}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize data file:", err);
    process.exit(1);
  });

/**
 * Optional: basic health route
 * (Not required, but helpful while testing)
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
