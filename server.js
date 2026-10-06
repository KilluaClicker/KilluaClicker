from pathlib import Path
import re

src = Path("/mnt/data/server(1).js")
out = Path("/mnt/data/server.js")

text = src.read_text(encoding="utf-8")

# 1) Rebirth constants
needle = 'const CHAT_MAX_LENGTH = 500;\n'
insert = '''const CHAT_MAX_LENGTH = 500;

/* =========================================================
   REBIRTHS
========================================================= */

const REBIRTHS = [
    {
        level: 1,
        price: "1000000",
        multiplier: "1.5"
    },
    {
        level: 2,
        price: "1000000000",
        multiplier: "2"
    },
    {
        level: 3,
        price: "1000000000000000000",
        multiplier: "2.5"
    },
    {
        level: 4,
        price: "1000000000000000000000000",
        multiplier: "3"
    },
    {
        level: 5,
        price: "1000000000000000000000000000000",
        multiplier: "4.5"
    },
    {
        level: 6,
        price: "100000000000000000000000000000000",
        multiplier: "10"
    }
];
'''
if needle not in text:
    raise SystemExit("Не найдено место для REBIRTHS")
text = text.replace(needle, insert, 1)

# 2) Add DB columns to users table definition
old = '''            click_power NUMERIC(100,0) NOT NULL DEFAULT 1,
            banned BOOLEAN NOT NULL DEFAULT FALSE,'''
new = '''            click_power NUMERIC(100,0) NOT NULL DEFAULT 1,
            rebirths INTEGER NOT NULL DEFAULT 0,
            rebirth_multiplier NUMERIC(20,2) NOT NULL DEFAULT 1,
            banned BOOLEAN NOT NULL DEFAULT FALSE,'''
if old not in text:
    raise SystemExit("Не найдено определение users")
text = text.replace(old, new, 1)

# 3) Add ALTER TABLE statements for existing DBs
needle = '''    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_admin
        BOOLEAN NOT NULL DEFAULT FALSE;
    `);
'''
insert = '''    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_admin
        BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS rebirths
        INTEGER NOT NULL DEFAULT 0;
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS rebirth_multiplier
        NUMERIC(20,2) NOT NULL DEFAULT 1;
    `);
'''
if needle not in text:
    raise SystemExit("Не найден ALTER is_admin")
text = text.replace(needle, insert, 1)

# 4) getUserById fields
old = '''            clicks,
            click_power,
            banned,
            is_admin,'''
new = '''            clicks,
            click_power,
            rebirths,
            rebirth_multiplier,
            banned,
            is_admin,'''
# There are many occurrences; first is getUserById.
if old not in text:
    raise SystemExit("Не найден getUserById SELECT")
text = text.replace(old, new, 1)

# 5) Registration INSERT
old = '''                            clicks,
                            click_power,
                            banned,
                            is_admin
                        )
                    VALUES
                        ($1, $2, 0, 1, false, false)
                    RETURNING
                        id,
                        username,
                        clicks,
                        click_power,
                        banned,
                        is_admin'''
new = '''                            clicks,
                            click_power,
                            rebirths,
                            rebirth_multiplier,
                            banned,
                            is_admin
                        )
                    VALUES
                        ($1, $2, 0, 1, 0, 1, false, false)
                    RETURNING
                        id,
                        username,
                        clicks,
                        click_power,
                        rebirths,
                        rebirth_multiplier,
                        banned,
                        is_admin'''
if old not in text:
    raise SystemExit("Не найден registration INSERT")
text = text.replace(old, new, 1)

# 6) Login response
old = '''                    clicks: user.clicks,
                    click_power:
                        user.click_power,
                    banned: user.banned,
                    is_admin:
                        user.is_admin'''
new = '''                    clicks: user.clicks,
                    click_power:
                        user.click_power,
                    rebirths:
                        user.rebirths,
                    rebirth_multiplier:
                        user.rebirth_multiplier,
                    banned: user.banned,
                    is_admin:
                        user.is_admin'''
# First occurrence after login should be this, but there is /api/me too. Replace first two occurrences? Need both.
count = text.count(old)
if count < 2:
    raise SystemExit(f"Ожидалось минимум 2 ответа user, найдено {count}")
text = text.replace(old, new, 2)

# 7) Click SQL: use multiplier
old = '''                    UPDATE users
                    SET clicks =
                        clicks + click_power'''
new = '''                    UPDATE users
                    SET clicks =
                        clicks +
                        (
                            click_power *
                            rebirth_multiplier
                        )'''
if old not in text:
    raise SystemExit("Не найден click UPDATE")
text = text.replace(old, new, 1)

# Add rebirth fields to click RETURNING
old = '''                        clicks,
                        click_power,
                        banned,
                        is_admin
                    `,'''
new = '''                        clicks,
                        click_power,
                        rebirths,
                        rebirth_multiplier,
                        banned,
                        is_admin
                    `,'''
# This exact sequence likely occurs click and maybe other places. First occurrence after click is enough.
idx = text.find('app.post(\n    "/api/click"')
if idx == -1:
    raise SystemExit("Не найден /api/click")
sub = text[idx:]
if old not in sub:
    raise SystemExit("Не найден click RETURNING")
sub = sub.replace(old, new, 1)
text = text[:idx] + sub

# 8) Add rebirth endpoint after click endpoint, before TOP
marker = '''/* =========================================================
   TOP
========================================================= */
'''
endpoint = r'''/* =========================================================
   REBIRTH
========================================================= */

app.get(
    "/api/rebirths",
    requireAuth,
    async (req, res) => {
        try {
            const user = req.currentUser;

            const currentLevel =
                Number(user.rebirths || 0);

            const next =
                REBIRTHS.find(
                    item => item.level === currentLevel + 1
                ) || null;

            res.json({
                success: true,
                current_rebirths: currentLevel,
                current_multiplier:
                    String(user.rebirth_multiplier || "1"),
                next
            });
        } catch (error) {
            console.error(
                "REBIRTH INFO ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка загрузки ребитхов."
            });
        }
    }
);


app.post(
    "/api/rebirth",
    requireAuth,
    async (req, res) => {
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const result = await client.query(
                `
                SELECT
                    id,
                    username,
                    clicks,
                    click_power,
                    rebirths,
                    rebirth_multiplier,
                    banned,
                    is_admin
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
                    message:
                        "Игрок не найден."
                });
            }

            const user = result.rows[0];

            if (user.banned) {
                await client.query("ROLLBACK");

                return res.status(403).json({
                    success: false,
                    message:
                        "Ваш аккаунт заблокирован."
                });
            }

            const currentLevel =
                Number(user.rebirths || 0);

            const rebirth =
                REBIRTHS.find(
                    item =>
                        item.level ===
                        currentLevel + 1
                );

            if (!rebirth) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Вы уже достигли максимального ребитха."
                });
            }

            const clicks =
                BigInt(String(user.clicks));

            const price =
                BigInt(rebirth.price);

            if (clicks < price) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        `Для ребитха ${rebirth.level} нужно ${rebirth.price} кликов.`,
                    required:
                        rebirth.price,
                    clicks:
                        String(user.clicks)
                });
            }

            const updated =
                await client.query(
                    `
                    UPDATE users
                    SET
                        clicks = 0,
                        rebirths = $1,
                        rebirth_multiplier = $2::numeric
                    WHERE id = $3
                    RETURNING
                        id,
                        username,
                        clicks,
                        click_power,
                        rebirths,
                        rebirth_multiplier,
                        banned,
                        is_admin
                    `,
                    [
                        rebirth.level,
                        rebirth.multiplier,
                        req.session.userId
                    ]
                );

            await client.query("COMMIT");

            res.json({
                success: true,
                message:
                    `Ребитх ${rebirth.level} выполнен! Кликов стало 0, множитель теперь ×${rebirth.multiplier}.`,
                rebirth: {
                    level:
                        rebirth.level,
                    price:
                        rebirth.price,
                    multiplier:
                        rebirth.multiplier
                },
                user:
                    updated.rows[0]
            });
        } catch (error) {
            try {
                await client.query("ROLLBACK");
            } catch {}

            console.error(
                "REBIRTH ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Ошибка ребитха."
            });
        } finally {
            client.release();
        }
    }
);


'''
if marker not in text:
    raise SystemExit("Не найден TOP marker")
text = text.replace(marker, endpoint + marker, 1)

# 9) Make admin users include rebirth info if exact SELECT exists.
old = '''                        clicks,
                        click_power,
                        banned,
                        is_admin,
                        created_at'''
new = '''                        clicks,
                        click_power,
                        rebirths,
                        rebirth_multiplier,
                        banned,
                        is_admin,
                        created_at'''
text = text.replace(old, new)

# 10) Ensure any user objects built from admin actions don't break; no need.

out.write_text(text, encoding="utf-8")
print(f"Готово: {out}")
print(f"Размер: {out.stat().st_size} байт")
