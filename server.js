const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db_config');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));


// Serve home.html when accessing "/"
const path = require('path');
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});


// Serve view_timetable.html
app.get('/api/timetable', (req, res) => {
  const { batch, branch } = req.query;

  if (!batch || !branch) {
    return res.status(400).json({ error: 'Both batch and branch (department) are required' });
  }

  const query = `
    SELECT DISTINCT
        s.Day AS Day,
        s.Time AS Time,
        c.Crs_Name AS Course,
        cl.Classroom_no AS Classroom,
        i.Name AS Instructor
    FROM 
        Time_Table t
    INNER JOIN Courses c ON t.Crs_Code = c.Crs_Code
    INNER JOIN Slots s ON t.Slot_ID = s.Slot_ID
    INNER JOIN Classroom cl ON t.Classroom_no = cl.Classroom_no
    INNER JOIN Instructor i ON t.Ins_ID = i.Ins_ID
    INNER JOIN Department d ON c.Dept_ID = d.Dept_ID
    WHERE 
        d.Dept_ID = ? 
        AND EXISTS (
            SELECT 1
            FROM Student st
            WHERE st.Batch = ? AND st.Dept_ID = d.Dept_ID
        )
    ORDER BY 
    FIELD(s.Day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
    STR_TO_DATE(LEFT(s.Time, LOCATE('-', s.Time) - 1), '%H:%i'),
    c.Crs_Name;
  `;

  db.query(query, [branch, batch], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch timetable' });
    }

    res.json(results);
  });
});


app.get('/api/departments', (req, res) => {
  const query = `
      SELECT 
          d.Dept_Name,
          JSON_ARRAYAGG(
              JSON_OBJECT(
                  'Name', i.Name,
                  'Email', i.Email
              )
          ) AS Faculties
      FROM Department d
      JOIN Instructor i ON d.Dept_ID = i.Dept_ID
      GROUP BY d.Dept_Name;
  `;

  db.query(query, (err, results) => {
      if (err) {
          console.error('Database Error:', err);
          return res.status(500).json({ error: 'Failed to fetch department details' });
      }

      try {
          // Parse Faculties into JSON if not already parsed
          const formattedResults = results.map(row => ({
              Dept_Name: row.Dept_Name,
              Faculties: typeof row.Faculties === 'string' ? JSON.parse(row.Faculties) : row.Faculties,
          }));

          res.json(formattedResults);
      } catch (parseError) {
          console.error('Parse Error:', parseError);
          return res.status(500).json({ error: 'Error formatting department details' });
      }
  });
});


// Login endpoint
app.post('/login', (req, res) => {
  const { id, password, role } = req.body;

  let table, idColumn;
  if (role === 'student') {
      table = 'Student_Login';
      idColumn = 'Stud_ID';
  } else if (role === 'faculty') {
      table = 'Faculty_Login';
      idColumn = 'Ins_ID';
  } else if (role === 'admin') {
      // Hardcoded admin credentials
      if (id === 'tlu' && password === 'iitj') {
          return res.json({ redirect: '/admin.html' });
      } else {
          return res.status(401).json({ error: 'Invalid admin credentials' });
      }
  } else {
      return res.status(400).json({ error: 'Invalid role provided' });
  }

  const query = `SELECT * FROM ${table} WHERE ${idColumn} = ? AND Password = ?`;
  console.log("Query:", query); // Debugging query
  db.query(query, [id, password], (err, results) => {
      if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }

      console.log("Query Results:", results); // Debugging results
      if (results.length > 0) {
          // Redirect based on role
          if (role === 'student') {
              return res.json({ redirect: `/student.html?id=${id}` });
          } else if (role === 'faculty') {
              return res.json({ redirect: `/faculty.html?id=${id}` });
          }
      } else {
          return res.status(401).json({ error: 'Invalid ID or password' });
      }
  });
});

                                                                                                                                                                                                   

// Endpoint to fetch student information
app.get('/api/student-info', (req, res) => {
  const { studentId } = req.query; // Pass student ID as query param

  const query = `
      SELECT s.Stud_ID, s.Name, s.Email, s.Dept_ID, s.Batch, d.Dept_Name
      FROM Student s
      INNER JOIN Department d ON s.Dept_ID = d.Dept_ID
      WHERE s.Stud_ID = ?;
  `;

  db.query(query, [studentId], (err, results) => {
      if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Failed to fetch student info' });
      }
      res.json(results[0]); // Send student info
  });
});

// Endpoint to fetch courses for a student
// Endpoint to fetch courses for a student
app.get('/api/student-courses', (req, res) => {
  const { studentId } = req.query;

  const query = `
      SELECT c.Crs_Name, c.Crs_Code
      FROM Enrollment e
      INNER JOIN Courses c ON e.Crs_Code = c.Crs_Code
      WHERE e.Stud_ID = ?;
  `;

  db.query(query, [studentId], (err, results) => {
      if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Failed to fetch courses' });
      }
      res.json(results);
  });
});


// Endpoint to fetch timetable for a student
// Endpoint to fetch timetable for a student
app.get('/api/student-timetable', (req, res) => {
  const { studentId } = req.query;

  const query = `
      SELECT 
          s.Day AS Day,
          s.Time AS Time,
          c.Crs_Name AS Course,
          cl.Classroom_no AS Classroom,
          i.Name AS Instructor
      FROM Enrollment e
      INNER JOIN Time_Table t ON e.Crs_Code = t.Crs_Code
      INNER JOIN Courses c ON t.Crs_Code = c.Crs_Code
      INNER JOIN Slots s ON t.Slot_ID = s.Slot_ID
      INNER JOIN Classroom cl ON t.Classroom_no = cl.Classroom_no
      INNER JOIN Instructor i ON t.Ins_ID = i.Ins_ID
      WHERE e.Stud_ID = ?
      ORDER BY 
          FIELD(s.Day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
          STR_TO_DATE(LEFT(s.Time, LOCATE('-', s.Time) - 1), '%H:%i');
  `;

  db.query(query, [studentId], (err, results) => {
      if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Failed to fetch timetable' });
      }
      res.json(results);
  });
});


// Endpoint to fetch faculty information and courses
app.get('/api/faculty-dashboard', (req, res) => {
    const facultyId = req.query.id;
  
    if (!facultyId) {
      return res.status(400).json({ error: 'Faculty ID is required' });
    }
  
    // Query to get faculty info (Name, Email, Department Name)
    const facultyQuery = `
      SELECT Instructor.Name, Instructor.Email, Department.Dept_Name
      FROM Instructor
      JOIN Department ON Instructor.Dept_ID = Department.Dept_ID
      WHERE Instructor.Ins_ID = ?
    `;
  
    db.query(facultyQuery, [facultyId], (err, facultyInfo) => {
      if (err) {
        console.error('Error fetching faculty info:', err);
        return res.status(500).json({ error: 'Failed to fetch faculty information' });
      }
  
      if (facultyInfo.length === 0) {
        return res.status(404).json({ error: 'Faculty not found' });
      }
  
      // Query to get faculty courses (Course Name, Course Code)
      const coursesQuery = `
        SELECT Courses.Crs_Name, Courses.Crs_Code
        FROM Courses
        JOIN Teaching ON Courses.Crs_Code = Teaching.Crs_Code
        WHERE Teaching.Ins_ID = ?
      `;
  
      db.query(coursesQuery, [facultyId], (err, courses) => {
        if (err) {
          console.error('Error fetching courses:', err);
          return res.status(500).json({ error: 'Failed to fetch courses' });
        }
  
        // Query to get faculty schedule (Day, Time, Course Name, Classroom Number)
        const scheduleQuery = `
          SELECT Day, Time, Crs_Name, Classroom_no 
          FROM Time_Table 
          NATURAL JOIN (
            SELECT Crs_Name, Crs_Code 
            FROM Courses
          ) AS CourseTable
          NATURAL JOIN Slots
          WHERE Ins_ID = ?;
        `;
  
        db.query(scheduleQuery, [facultyId], (err, schedule) => {
          if (err) {
            console.error('Error fetching schedule:', err);
            return res.status(500).json({ error: 'Failed to fetch schedule' });
          }
  
          // Return the data to the frontend
          res.json({
            facultyInfo: facultyInfo[0], // Assuming facultyInfo returns an array with a single object
            courses: courses,
            schedule: schedule,
          });
        });
      });
    });
  });
  


// Endpoint to fetch free classrooms for a time slot
app.get('/api/free-classrooms', (req, res) => {
  const { timeSlot } = req.query;

  const query = `
      SELECT Classroom_no, Capacity
      FROM Classroom
      WHERE
      Classroom_no NOT IN ('C3I-3','KDoM','HTT','FFO','Thermal','Manufacturing')
      AND
      Classroom_no NOT IN (
          SELECT Classroom_no FROM Classroom_Booking WHERE Slot_ID = ?
      );
  `;

  db.query(query, [timeSlot], (err, results) => {
      if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Failed to fetch free classrooms' });
      }
      res.json(results);
  });
});

// Endpoint to get number of students dept and batch wise for a course
// Endpoint to fetch student info for a course
app.get('/api/student-info-for-a-course', (req, res) => {
    const { courseCode } = req.query;
    const query = `
        SELECT Dept_ID, Batch, COUNT(*) AS num_students
        FROM Student NATURAL JOIN Enrollment
        WHERE Crs_Code = ?
        GROUP BY Dept_ID, Batch;
    `;
    db.query(query, [courseCode], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch student info' });
        }
        res.json(results);
    });
});



// Endpoint to fetch student info for a course
// Endpoint to fetch student info for a course
app.get('/api/student-info-for-course', (req, res) => {
    const { courseCode } = req.query;

    const query = `
        SELECT Stud_ID, Name, Email
        FROM Student NATURAL JOIN Enrollment
        WHERE Crs_Code = ?;
    `;

    db.query(query, [courseCode], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch student info' });
        }
        res.json(results);
    });
});


// Endpoint to fetch free time slots for a course
app.get('/api/free-time-slots', (req, res) => {
    const { courseCode } = req.query;
  
    const query = `
        SELECT Slot_ID
        FROM Slots
        WHERE Slot_ID NOT IN (
            SELECT Slot_ID
            FROM Time_Table
            WHERE Crs_Code IN (
                SELECT Crs_Code
                FROM Enrollment
                WHERE Stud_ID IN (
                    SELECT Stud_ID
                    FROM Enrollment
                    WHERE Crs_Code = ?
                )
            )
        )
        AND Slot_ID NOT IN (
            SELECT Slot_ID
            FROM Time_Table
            WHERE Ins_ID IN (
                SELECT Ins_ID
                FROM Teaching
                WHERE Crs_Code = ?
            )
        );`
    ;
  
    db.query(query, [courseCode, courseCode], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch free time slots' });
        }
        res.json(results);
    });
  }); 
  

// Endpoint to view all slots grouped by Slot_ID
// Endpoint to view all slots without grouping
// Endpoint to view all slots
app.get('/api/view-slots', (req, res) => {
    const query = `
        SELECT Slot_ID, Day AS Day, Time AS Time
        FROM Slots;
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch slots' });
        }
        res.json(results);
    });
});



// Endpoint to book a slot
app.post('/api/book-slot', (req, res) => {
    const { courseCode, slotId, classroomNo } = req.body;

    if (!courseCode || !slotId || !classroomNo) {
        return res.status(400).json({ error: 'Course code, slot ID, and classroom number are required.' });
    }

    // Query to fetch instructor ID for the given course
    const fetchInstructorQuery = `
        SELECT Ins_ID 
        FROM Teaching 
        WHERE Crs_Code = ?;              
    `;

    // Insert queries
    const insertTimeTableQuery = `
        INSERT INTO Time_Table (Crs_Code, Slot_ID, Classroom_no, Ins_ID)
        VALUES (?, ?, ?, ?);
    `;

    const insertScheduledSlotQuery = `
        INSERT INTO Scheduled_Slots (Slot_ID, Ins_ID)
        VALUES (?, ?);
    `;

    const insertClassroomBookingQuery = `
        INSERT INTO Classroom_Booking (Classroom_no, Slot_ID)
        VALUES (?, ?);
    `;

    // Fetch Instructor ID and perform updates
    db.query(fetchInstructorQuery, [courseCode], (err, instructorResults) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch instructor ID.' });
        }

        if (instructorResults.length === 0) {
            return res.status(404).json({ error: 'Instructor not found for the given course.' });
        }

        const instructorId = instructorResults[0].Ins_ID;

        // Begin transaction
        db.beginTransaction(err => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to start transaction.' });
            }

            // Insert into Time_Table
            db.query(insertTimeTableQuery, [courseCode, slotId, classroomNo, instructorId], err => {
                if (err) {
                    return db.rollback(() => {
                        console.error(err);
                        res.status(500).json({ error: 'Failed to update Time Table.' });
                    });
                }

                // Insert into Scheduled_Slots
                db.query(insertScheduledSlotQuery, [slotId, instructorId], err => {
                    if (err) {
                        return db.rollback(() => {
                            console.error(err);
                            res.status(500).json({ error: 'Failed to update Scheduled Slots.' });
                        });
                    }

                    // Insert into Classroom_Booking
                    db.query(insertClassroomBookingQuery, [classroomNo, slotId], err => {
                        if (err) {
                            return db.rollback(() => {
                                console.error(err);
                                res.status(500).json({ error: 'Failed to update Classroom Booking.' });
                            });
                        }

                        // Commit transaction
                        db.commit(err => {
                            if (err) {
                                return db.rollback(() => {
                                    console.error(err);
                                    res.status(500).json({ error: 'Failed to commit transaction.' });
                                });
                            }

                            res.json({ message: 'Slot successfully booked and all records updated.' });
                        });
                    });
                });
            });
        });
    });
});

              

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
