import { createClient } from "@libsql/client/web";

export const db = createClient({
  url: "libsql://swdef-ewrtesfe.aws-ap-south-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzE2NzA2NjYsImlkIjoiYjI4YzA1NDgtYTJmOS00MGE1LTg3ZWQtYThkYTMxYjAyY2NkIiwicmlkIjoiN2Q4MzM0NDAtNTY5NC00MjlkLWFiODgtYjY3Y2NlYmZmNDdiIn0.O7pqTvywamTTFjS8zXwRJylZcI2TqYVosBEyP9tUf3tOoZtKSuP6FzIjaaJiyWdwBP8qlACFBjyzB3Im9CsVDw",
});

export const initDb = async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        area TEXT NOT NULL,
        distributor TEXT,
        time TEXT NOT NULL,
        packets INTEGER,
        notes TEXT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        date TEXT NOT NULL
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        location_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (location_id) REFERENCES locations(id)
      )
    `);
    console.log("Database initialized with comments table");
  } catch (error) {
    console.error("Database initialization failed:", error);
  }
};
