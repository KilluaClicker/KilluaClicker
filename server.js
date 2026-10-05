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

app.use(express.json());

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || "killuaclicker-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 30,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    }
  })
);

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clans (
      id SERIAL PRIMARY KEY,
      name VARCHAR(32) UNIQUE NOT NULL,
      tag VARCHAR(8) UNIQUE NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clan_members (
      id SERIAL PRIMARY KEY,
      clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const adminPassword = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || "Kotkova2015",
    10
  );

  await pool.query(
    `
    INSERT INTO users (username, password)
    VALUES ($1, $2)
    ON CONFLICT (username) DO NOTHING
    `,
    [process.env.ADMIN_USERNAME || "Killua666", adminPassword]
  );

  console.log("Database initialized");
}

// =========================
// HELPERS
// =========================

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      error: "Необходимо войти в аккаунт"
    });
  }

  next();
}

async function getUser(userId) {
  const result = await pool.query(
    `
    SELECT id, username, clicks, banned, created_at
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  return result.rows[0];
}

async function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      error: "Не авторизован"
    });
  }

  const user = await getUser(req.session.userId);

  if (!user || user.username !== (process.env.ADMIN_USERNAME || "Killua666")) {
    return res.status(403).json({
      success: false,
      error: "Нет доступа"
    });
  }

  next();
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
    res.status(500).json({
      success: false,
      error: "Database error"
    });
  }
});

// =========================
// REGISTER
// =========================

app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Заполни все поля"
      });
    }

    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      return res.status(400).json({
        success: false,
        error: "Логин: 3-32 символа, только буквы, цифры и _"
      });
    }

    if (password.length < 4) {
      return res.status(400).json({
        success: false,
        error: "Пароль должен быть минимум 4 символа"
      });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
      [username]
    );

    if (existing.rows.length) {
      return res.status(400).json({
        success: false,
        error: "Такой пользователь уже существует"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (username, password)
      VALUES ($1, $2)
      RETURNING id, username, clicks, banned
      `,
      [username, hashedPassword]
    );

    const user = result.rows[0];

    req.session.userId = user.id;

    req.session.save((err) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          success: false,
          error: "Ошибка сохранения сессии"
        });
      }

      res.json({
        success: true,
        user
      });
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      success: false,
      error: "Ошибка сервера"
    });
  }
});

// =========================
// LOGIN
// =========================

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE LOWER(username) = LOWER($1)",
      [username]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        success: false,
        error: "Неверный логин или пароль"
      });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({
        success: false,
        error: "Неверный логин или пароль"
      });
    }

    if (user.banned) {
      return res.status(403).json({
        success: false,
        error: "Ваш аккаунт заблокирован"
      });
    }

    req.session.userId = user.id;

    req.session.save((err) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          success: false,
          error: "Ошибка сессии"
        });
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          clicks: user.clicks,
          banned: user.banned
        }
      });
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      success: false,
      error: "Ошибка сервера"
    });
  }
});

// =========================
// LOGOUT
// =========================

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      success: true
    });
  });
});

// =========================
// ME
// =========================

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Пользователь не найден"
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка сервера"
    });
  }
});

// =========================
// CLICK
// =========================

app.post("/api/click", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE users
      SET clicks = clicks + 1
      WHERE id = $1 AND banned = FALSE
      RETURNING clicks
      `,
      [req.session.userId]
    );

    if (!result.rows.length) {
      return res.status(403).json({
        success: false,
        error: "Аккаунт заблокирован"
      });
    }

    res.json({
      success: true,
      clicks: result.rows[0].clicks
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "Ошибка клика"
    });
  }
});

// =========================
// TOP PLAYERS
// =========================

app.get("/api/top", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT username, clicks
      FROM users
      WHERE banned = FALSE
      ORDER BY clicks DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка загрузки топа"
    });
  }
});

// ======================================================
// STORE
// ======================================================

const STORE_ITEMS = [
  {
    id: "1",
    name: "1 клик",
    amount: "1",
    price: "0"
  },
  {
    id: "10",
    name: "10 кликов",
    amount: "10",
    price: "5"
  },
  {
    id: "100",
    name: "100 кликов",
    amount: "100",
    price: "40"
  },
  {
    id: "1000",
    name: "1 000 кликов",
    amount: "1000",
    price: "350"
  },
  {
    id: "million",
    name: "1 миллион",
    amount: "1000000",
    price: "300000"
  },
  {
    id: "billion",
    name: "1 миллиард",
    amount: "1000000000",
    price: "300000000"
  },
  {
    id: "trillion",
    name: "1 триллион",
    amount: "1000000000000",
    price: "300000000000"
  },
  {
    id: "quadrillion",
    name: "1 квадриллион",
    amount: "1000000000000000",
    price: "300000000000000"
  },
  {
    id: "quintillion",
    name: "1 квинтиллион",
    amount: "1000000000000000000",
    price: "300000000000000000"
  },
  {
    id: "sextillion",
    name: "1 секстиллион",
    amount: "1000000000000000000000",
    price: "300000000000000000000"
  }
];

app.get("/api/shop", requireAuth, (req, res) => {
  res.json({
    success: true,
    items: STORE_ITEMS
  });
});

app.post("/api/shop/buy", requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const { itemId } = req.body;

    const item = STORE_ITEMS.find((x) => x.id === itemId);

    if (!item) {
      return res.status(400).json({
        success: false,
        error: "Товар не найден"
      });
    }

    const price = BigInt(item.price);
    const amount = BigInt(item.amount);

    await client.query("BEGIN");

    const result = await client.query(
      `
      SELECT clicks
      FROM users
      WHERE id = $1
      FOR UPDATE
      `,
      [req.session.userId]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        error: "Пользователь не найден"
      });
    }

    const currentClicks = BigInt(result.rows[0].clicks);

    if (currentClicks < price) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        error: "Недостаточно кликов"
      });
    }

    const newClicks = currentClicks - price + amount;

    await client.query(
      `
      UPDATE users
      SET clicks = $1
      WHERE id = $2
      `,
      [newClicks.toString(), req.session.userId]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      clicks: newClicks.toString(),
      message: `Получено ${item.name}`
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("SHOP ERROR:", error);

    res.status(500).json({
      success: false,
      error: "Ошибка покупки"
    });
  } finally {
    client.release();
  }
});

// ======================================================
// CLANS
// ======================================================

// Получить клан игрока
app.get("/api/clans/my", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.tag,
        c.owner_id,
        c.created_at,
        u.username AS owner_username
      FROM clan_members cm
      JOIN clans c ON c.id = cm.clan_id
      JOIN users u ON u.id = c.owner_id
      WHERE cm.user_id = $1
      `,
      [req.session.userId]
    );

    if (!result.rows.length) {
      return res.json({
        success: true,
        clan: null
      });
    }

    const clan = result.rows[0];

    const members = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.clicks
      FROM clan_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.clan_id = $1
      ORDER BY u.clicks DESC
      `,
      [clan.id]
    );

    res.json({
      success: true,
      clan,
      members: members.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "Ошибка загрузки клана"
    });
  }
});

// Создать клан
app.post("/api/clans/create", requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    let { name, tag } = req.body;

    name = String(name || "").trim();
    tag = String(tag || "").trim().toUpperCase();

    if (name.length < 3 || name.length > 32) {
      return res.status(400).json({
        success: false,
        error: "Название клана: 3-32 символа"
      });
    }

    if (!/^[a-zA-Z0-9а-яА-Я_ ]+$/.test(name)) {
      return res.status(400).json({
        success: false,
        error: "Недопустимые символы в названии"
      });
    }

    if (!/^[A-Z0-9]{2,8}$/.test(tag)) {
      return res.status(400).json({
        success: false,
        error: "Тег: 2-8 букв или цифр"
      });
    }

    const already = await client.query(
      `
      SELECT clan_id
      FROM clan_members
      WHERE user_id = $1
      `,
      [req.session.userId]
    );

    if (already.rows.length) {
      return res.status(400).json({
        success: false,
        error: "Ты уже состоишь в клане"
      });
    }

    await client.query("BEGIN");

    const clan = await client.query(
      `
      INSERT INTO clans (name, tag, owner_id)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [name, tag, req.session.userId]
    );

    await client.query(
      `
      INSERT INTO clan_members (clan_id, user_id)
      VALUES ($1, $2)
      `,
      [clan.rows[0].id, req.session.userId]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      clan: clan.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        error: "Такое название или тег уже заняты"
      });
    }

    console.error("CREATE CLAN ERROR:", error);

    res.status(500).json({
      success: false,
      error: "Ошибка создания клана"
    });
  } finally {
    client.release();
  }
});

// Все кланы
app.get("/api/clans", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.tag,
        c.owner_id,
        u.username AS owner_username,
        COUNT(cm.user_id)::INTEGER AS members,
        COALESCE(SUM(u2.clicks), 0)::TEXT AS clicks
      FROM clans c
      JOIN users u ON u.id = c.owner_id
      LEFT JOIN clan_members cm ON cm.clan_id = c.id
      LEFT JOIN users u2 ON u2.id = cm.user_id
      GROUP BY c.id, u.username
      ORDER BY COALESCE(SUM(u2.clicks), 0) DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      clans: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "Ошибка загрузки кланов"
    });
  }
});

// Вступить
app.post("/api/clans/:id/join", requireAuth, async (req, res) => {
  try {
    const clanId = Number(req.params.id);

    if (!Number.isInteger(clanId)) {
      return res.status(400).json({
        success: false,
        error: "Неверный клан"
      });
    }

    const already = await pool.query(
      `
      SELECT clan_id
      FROM clan_members
      WHERE user_id = $1
      `,
      [req.session.userId]
    );

    if (already.rows.length) {
      return res.status(400).json({
        success: false,
        error: "Ты уже состоишь в клане"
      });
    }

    const clan = await pool.query(
      "SELECT id FROM clans WHERE id = $1",
      [clanId]
    );

    if (!clan.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Клан не найден"
      });
    }

    await pool.query(
      `
      INSERT INTO clan_members (clan_id, user_id)
      VALUES ($1, $2)
      `,
      [clanId, req.session.userId]
    );

    res.json({
      success: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка вступления"
    });
  }
});

// Выйти
app.post("/api/clans/leave", requireAuth, async (req, res) => {
  try {
    const membership = await pool.query(
      `
      SELECT cm.clan_id, c.owner_id
      FROM clan_members cm
      JOIN clans c ON c.id = cm.clan_id
      WHERE cm.user_id = $1
      `,
      [req.session.userId]
    );

    if (!membership.rows.length) {
      return res.status(400).json({
        success: false,
        error: "Ты не состоишь в клане"
      });
    }

    if (membership.rows[0].owner_id === req.session.userId) {
      return res.status(400).json({
        success: false,
        error: "Создатель не может выйти из клана. Передай клан или удали его."
      });
    }

    await pool.query(
      `
      DELETE FROM clan_members
      WHERE user_id = $1
      `,
      [req.session.userId]
    );

    res.json({
      success: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка выхода из клана"
    });
  }
});

// =========================
// ADMIN
// =========================

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, clicks, banned, created_at
      FROM users
      ORDER BY clicks DESC
    `);

    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка"
    });
  }
});

app.post("/api/admin/user/:id/clicks", requireAdmin, async (req, res) => {
  try {
    const clicks = String(req.body.clicks || "0");

    await pool.query(
      `
      UPDATE users
      SET clicks = $1
      WHERE id = $2
      `,
      [clicks, req.params.id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка"
    });
  }
});

app.post("/api/admin/user/:id/add-clicks", requireAdmin, async (req, res) => {
  try {
    const amount = String(req.body.amount || "0");

    await pool.query(
      `
      UPDATE users
      SET clicks = clicks + $1
      WHERE id = $2
      `,
      [amount, req.params.id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка"
    });
  }
});

app.post("/api/admin/user/:id/ban", requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `
      UPDATE users
      SET banned = NOT banned
      WHERE id = $1
      `,
      [req.params.id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка"
    });
  }
});

app.post("/api/admin/user/:id/username", requireAdmin, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();

    await pool.query(
      `
      UPDATE users
      SET username = $1
      WHERE id = $2
      `,
      [username, req.params.id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка"
    });
  }
});

app.delete("/api/admin/user/:id", requireAdmin, async (req, res) => {
  try {
    if (Number(req.params.id) === req.session.userId) {
      return res.status(400).json({
        success: false,
        error: "Нельзя удалить самого себя"
      });
    }

    await pool.query(
      "DELETE FROM users WHERE id = $1",
      [req.params.id]
    );

    res.json({
      success: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка"
    });
  }
});

// =========================
// ERROR
// =========================

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    success: false,
    error: "Внутренняя ошибка сервера"
  });
});

// =========================
// START
// =========================

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`KilluaClicker запущен на порту ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("DATABASE INIT ERROR:", error);
    process.exit(1);
  });