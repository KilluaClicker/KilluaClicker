require("dotenv").config();

const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Killua666";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Kotkova2015";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// SESSION
// =========================

app.use(
  session({
    store: new pgSession({
      pool: pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || "killuaclicker-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  })
);

// =========================
// STATIC
// =========================

app.use(express.static(path.join(__dirname, "public")));

// =========================
// DATABASE
// =========================

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      clicks BIGINT NOT NULL DEFAULT 0,
      banned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const adminCheck = await pool.query(
    "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
    [ADMIN_USERNAME]
  );

  if (adminCheck.rows.length === 0) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    await pool.query(
      `INSERT INTO users (username, password, clicks, banned)
       VALUES ($1, $2, 0, false)`,
      [ADMIN_USERNAME, hash]
    );

    console.log("Администратор создан:", ADMIN_USERNAME);
  }
}

// =========================
// HELPERS
// =========================

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "Вы не авторизованы"
    });
  }

  next();
}

async function getUserById(id) {
  const result = await pool.query(
    `SELECT id, username, clicks, banned, created_at
     FROM users
     WHERE id = $1`,
    [id]
  );

  return result.rows[0];
}

async function requireAdmin(req, res, next) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: "Не авторизован"
      });
    }

    const user = await getUserById(req.session.userId);

    if (!user || user.username !== ADMIN_USERNAME) {
      return res.status(403).json({
        success: false,
        message: "Доступ только для администратора"
      });
    }

    next();
  } catch (error) {
    console.error("ADMIN AUTH ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Ошибка проверки администратора"
    });
  }
}

// =========================
// HEALTH
// =========================

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      message: "KilluaClicker server работает",
      database: "connected"
    });
  } catch (error) {
    console.error("HEALTH ERROR:", error);

    res.status(500).json({
      success: false,
      message: "База данных недоступна"
    });
  }
});

// =========================
// REGISTER
// =========================

app.post("/api/register", async (req, res) => {
  try {
    console.log("REGISTER REQUEST:", req.body);

    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Введите логин и пароль"
      });
    }

    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({
        success: false,
        message: "Логин должен быть от 3 до 32 символов"
      });
    }

    if (password.length < 4) {
      return res.status(400).json({
        success: false,
        message: "Пароль должен быть минимум 4 символа"
      });
    }

    // Проверяем существование пользователя
    const exists = await pool.query(
      `SELECT id
       FROM users
       WHERE LOWER(username) = LOWER($1)`,
      [username]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Такой пользователь уже существует"
      });
    }

    // Хешируем пароль
    const hash = await bcrypt.hash(password, 12);

    // Создаём пользователя
    const result = await pool.query(
      `INSERT INTO users (username, password, clicks, banned)
       VALUES ($1, $2, 0, false)
       RETURNING id, username, clicks, banned, created_at`,
      [username, hash]
    );

    const user = result.rows[0];

    console.log("USER CREATED:", user.username);

    // Создаём авторизацию
    req.session.userId = user.id;

    // ВАЖНО:
    // Явно сохраняем сессию перед отправкой ответа.
    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    console.log("SESSION SAVED FOR:", user.username);

    return res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error("REGISTER ERROR:");
    console.error(error);

    // Если пользователь уже существует
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Такой пользователь уже существует"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Ошибка регистрации: " + (error.message || "неизвестная ошибка")
    });
  }
});

// =========================
// LOGIN
// =========================

app.post("/api/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Введите логин и пароль"
      });
    }

    const result = await pool.query(
      `SELECT *
       FROM users
       WHERE LOWER(username) = LOWER($1)`,
      [username]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Неверный логин или пароль"
      });
    }

    if (user.banned) {
      return res.status(403).json({
        success: false,
        message: "Ваш аккаунт заблокирован"
      });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Неверный логин или пароль"
      });
    }

    req.session.userId = user.id;

    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        clicks: user.clicks,
        banned: user.banned,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Ошибка входа: " + (error.message || "неизвестная ошибка")
    });
  }
});

// =========================
// LOGOUT
// =========================

app.post("/api/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("LOGOUT ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Ошибка выхода"
      });
    }

    res.clearCookie("connect.sid");

    res.json({
      success: true
    });
  });
});

// =========================
// CURRENT USER
// =========================

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.session.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Пользователь не найден"
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error("ME ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Ошибка получения профиля"
    });
  }
});

// =========================
// CLICK
// =========================

app.post("/api/click", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users
       SET clicks = clicks + 1
       WHERE id = $1
       RETURNING id, username, clicks, banned, created_at`,
      [req.session.userId]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Пользователь не найден"
      });
    }

    res.json({
      success: true,
      clicks: user.clicks,
      user
    });

  } catch (error) {
    console.error("CLICK ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Ошибка клика"
    });
  }
});

// =========================
// TOP
// =========================

app.get("/api/top", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, clicks
      FROM users
      WHERE banned = false
      ORDER BY clicks DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      users: result.rows
    });

  } catch (error) {
    console.error("TOP ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Ошибка загрузки топа"
    });
  }
});

// =========================
// ADMIN USERS
// =========================

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, clicks, banned, created_at
      FROM users
      ORDER BY id ASC
    `);

    res.json({
      success: true,
      users: result.rows
    });

  } catch (error) {
    console.error("ADMIN USERS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Ошибка загрузки пользователей"
    });
  }
});

// =========================
// ADMIN SET CLICKS
// =========================

app.post(
  "/api/admin/user/:id/clicks",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const clicks = Number(req.body?.clicks);

      if (!Number.isFinite(id) || !Number.isFinite(clicks)) {
        return res.status(400).json({
          success: false,
          message: "Неверные данные"
        });
      }

      const result = await pool.query(
        `UPDATE users
         SET clicks = $1
         WHERE id = $2
         RETURNING id, username, clicks, banned, created_at`,
        [Math.floor(Math.max(0, clicks)), id]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          message: "Пользователь не найден"
        });
      }

      res.json({
        success: true,
        user: result.rows[0]
      });

    } catch (error) {
      console.error("SET CLICKS ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Ошибка изменения кликов"
      });
    }
  }
);

// =========================
// ADMIN ADD CLICKS
// =========================

app.post(
  "/api/admin/user/:id/add-clicks",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const amount = Number(req.body?.amount);

      if (!Number.isFinite(id) || !Number.isFinite(amount)) {
        return res.status(400).json({
          success: false,
          message: "Неверные данные"
        });
      }

      const result = await pool.query(
        `UPDATE users
         SET clicks = GREATEST(0, clicks + $1)
         WHERE id = $2
         RETURNING id, username, clicks, banned, created_at`,
        [Math.floor(amount), id]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          message: "Пользователь не найден"
        });
      }

      res.json({
        success: true,
        user: result.rows[0]
      });

    } catch (error) {
      console.error("ADD CLICKS ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Ошибка добавления кликов"
      });
    }
  }
);

// =========================
// ADMIN BAN
// =========================

app.post(
  "/api/admin/user/:id/ban",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const banned = Boolean(req.body?.banned);

      const target = await getUserById(id);

      if (!target) {
        return res.status(404).json({
          success: false,
          message: "Пользователь не найден"
        });
      }

      if (target.username === ADMIN_USERNAME) {
        return res.status(400).json({
          success: false,
          message: "Администратора нельзя заблокировать"
        });
      }

      const result = await pool.query(
        `UPDATE users
         SET banned = $1
         WHERE id = $2
         RETURNING id, username, clicks, banned, created_at`,
        [banned, id]
      );

      res.json({
        success: true,
        user: result.rows[0]
      });

    } catch (error) {
      console.error("BAN ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Ошибка блокировки"
      });
    }
  }
);

// =========================
// ADMIN CHANGE USERNAME
// =========================

app.post(
  "/api/admin/user/:id/username",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const username = String(req.body?.username || "").trim();

      const target = await getUserById(id);

      if (!target) {
        return res.status(404).json({
          success: false,
          message: "Пользователь не найден"
        });
      }

      if (target.username === ADMIN_USERNAME) {
        return res.status(400).json({
          success: false,
          message: "Логин администратора нельзя изменить"
        });
      }

      if (username.length < 3 || username.length > 32) {
        return res.status(400).json({
          success: false,
          message: "Логин должен быть от 3 до 32 символов"
        });
      }

      const exists = await pool.query(
        `SELECT id
         FROM users
         WHERE LOWER(username) = LOWER($1)
         AND id != $2`,
        [username, id]
      );

      if (exists.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Этот логин уже занят"
        });
      }

      const result = await pool.query(
        `UPDATE users
         SET username = $1
         WHERE id = $2
         RETURNING id, username, clicks, banned, created_at`,
        [username, id]
      );

      res.json({
        success: true,
        user: result.rows[0]
      });

    } catch (error) {
      console.error("USERNAME ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Ошибка изменения логина"
      });
    }
  }
);

// =========================
// ADMIN DELETE
// =========================

app.delete(
  "/api/admin/user/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const target = await getUserById(id);

      if (!target) {
        return res.status(404).json({
          success: false,
          message: "Пользователь не найден"
        });
      }

      if (target.username === ADMIN_USERNAME) {
        return res.status(400).json({
          success: false,
          message: "Администратора нельзя удалить"
        });
      }

      await pool.query(
        "DELETE FROM users WHERE id = $1",
        [id]
      );

      res.json({
        success: true
      });

    } catch (error) {
      console.error("DELETE ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Ошибка удаления"
      });
    }
  }
);

// =========================
// ERROR HANDLER
// =========================

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    message: "Ошибка сервера"
  });
});

// =========================
// START
// =========================

async function start() {
  try {
    console.log("Подключение к Supabase...");

    await pool.query("SELECT 1");

    console.log("Supabase PostgreSQL подключена.");

    await initDatabase();

    app.listen(PORT, () => {
      console.log("");
      console.log("====================================");
      console.log("      KILLUACLICKER SERVER");
      console.log("====================================");
      console.log(`Server: http://localhost:${PORT}`);
      console.log("Database: Supabase PostgreSQL");
      console.log("====================================");
      console.log("");
    });

  } catch (error) {
    console.error("");
    console.error("НЕ УДАЛОСЬ ЗАПУСТИТЬ СЕРВЕР");
    console.error(error);
    console.error("");

    process.exit(1);
  }
}

start();