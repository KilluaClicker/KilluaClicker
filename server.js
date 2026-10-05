```js
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Killua666";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Kotkova2015";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        store: new pgSession({
            pool: pool,
            tableName: "user_sessions",
            createTableIfMissing: true
        }),

        secret:
            process.env.SESSION_SECRET ||
            "killuaclicker-secret",

        resave: false,
        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            secure: "auto",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 30
        }
    })
);

app.use(express.static(path.join(__dirname, "public")));

// ==================================================
// DATABASE
// ==================================================

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(32) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                clicks NUMERIC(100,0) NOT NULL DEFAULT 0,
                banned BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            ALTER TABLE users
            ALTER COLUMN clicks TYPE NUMERIC(100,0)
            USING clicks::numeric;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS clans (
                id SERIAL PRIMARY KEY,
                name VARCHAR(32) UNIQUE NOT NULL,
                tag VARCHAR(8) UNIQUE NOT NULL,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS clan_members (
                id SERIAL PRIMARY KEY,
                clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("База данных готова.");
    } catch (error) {
        console.error("Ошибка базы данных:");
        console.error(error);
    }
}

// ==================================================
// HELPERS
// ==================================================

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Сессия закончилась. Войдите снова."
        });
    }

    next();
}

async function getUserById(id) {
    const result = await pool.query(
        `
        SELECT id, username, clicks, banned, created_at
        FROM users
        WHERE id = $1
        `,
        [id]
    );

    return result.rows[0] || null;
}

async function requireAdmin(req, res, next) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Не авторизован."
            });
        }

        const user = await getUserById(req.session.userId);

        if (!user || user.username !== ADMIN_USERNAME) {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещён."
            });
        }

        next();
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });
    }
}

function validUsername(username) {
    return (
        typeof username === "string" &&
        username.length >= 3 &&
        username.length <= 32 &&
        /^[a-zA-Z0-9_]+$/.test(username)
    );
}

function validPassword(password) {
    return (
        typeof password === "string" &&
        password.length >= 4 &&
        password.length <= 100
    );
}

// ==================================================
// HEALTH
// ==================================================

app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            success: true,
            message: "KilluaClicker server работает",
            database: "connected"
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Ошибка базы данных"
        });
    }
});

// ==================================================
// REGISTER
// ==================================================

app.post("/api/register", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!validUsername(username)) {
            return res.status(400).json({
                success: false,
                message:
                    "Логин должен содержать от 3 до 32 символов: буквы, цифры или _."
            });
        }

        if (!validPassword(password)) {
            return res.status(400).json({
                success: false,
                message: "Пароль должен быть минимум 4 символа."
            });
        }

        const existing = await pool.query(
            `
            SELECT id
            FROM users
            WHERE LOWER(username) = LOWER($1)
            `,
            [username]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Такой пользователь уже существует."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `
            INSERT INTO users
                (username, password, clicks, banned)
            VALUES
                ($1, $2, 0, false)
            RETURNING id, username, clicks, banned
            `,
            [username, hashedPassword]
        );

        const user = result.rows[0];

        req.session.regenerate((err) => {
            if (err) {
                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Ошибка создания сессии."
                });
            }

            req.session.userId = user.id;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error(saveError);

                    return res.status(500).json({
                        success: false,
                        message: "Ошибка сохранения сессии.
```
