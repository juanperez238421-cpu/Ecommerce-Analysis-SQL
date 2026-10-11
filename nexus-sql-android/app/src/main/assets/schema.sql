PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS robots (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL,
 energy INTEGER NOT NULL CHECK(energy BETWEEN 0 AND 100),
 cargo INTEGER NOT NULL DEFAULT 0 CHECK(cargo BETWEEN 0 AND 3),
 cargo_resource TEXT DEFAULT NULL,
 capacity INTEGER NOT NULL DEFAULT 3,
 status TEXT NOT NULL DEFAULT 'IDLE', heading TEXT NOT NULL DEFAULT 'E',
 jobs_completed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS resource_nodes (
 id INTEGER PRIMARY KEY, x INTEGER NOT NULL, y INTEGER NOT NULL,
 resource TEXT NOT NULL, stock INTEGER NOT NULL, max_stock INTEGER NOT NULL,
 richness INTEGER NOT NULL CHECK(richness BETWEEN 1 AND 3),
 UNIQUE(x,y)
);
CREATE TABLE IF NOT EXISTS facilities (
 id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
 x INTEGER NOT NULL, y INTEGER NOT NULL, integrity INTEGER NOT NULL DEFAULT 100
);
CREATE TABLE IF NOT EXISTS inventory (item TEXT PRIMARY KEY, quantity INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, tick INTEGER NOT NULL,
 kind TEXT NOT NULL, message TEXT NOT NULL, x INTEGER, y INTEGER
);
-- jobs shows the highest-priority job for each robot, recomputed from live SQL tables.
-- Priorities: recharge -> delivery -> nearest available mineral deposit.
CREATE VIEW IF NOT EXISTS jobs AS
WITH candidates AS (
 SELECT r.id AS robot_id, 'CHARGE' AS action, f.x, f.y, 120 AS priority,
        ABS(r.x-f.x)+ABS(r.y-f.y) AS distance
 FROM robots r CROSS JOIN facilities f
 WHERE f.type='CHARGER' AND r.energy<26
 UNION ALL
 SELECT r.id, 'DELIVER', f.x, f.y, 100,
        ABS(r.x-f.x)+ABS(r.y-f.y)
 FROM robots r CROSS JOIN facilities f
 WHERE f.type='DEPOT' AND r.cargo>0 AND r.energy>=26
 UNION ALL
 SELECT r.id, 'MINE', n.x, n.y,
        CASE WHEN (r.id=1 AND n.resource='CRYSTAL')
                   OR (r.id=2 AND n.resource='ALLOY')
             THEN 85+n.richness*4 ELSE 60+n.richness*4 END,
        ABS(r.x-n.x)+ABS(r.y-n.y)
 FROM robots r CROSS JOIN resource_nodes n
 WHERE r.cargo=0 AND r.energy>=26 AND n.stock>0
 )
SELECT c.robot_id,c.action,c.x,c.y,c.priority,c.distance FROM candidates c
WHERE NOT EXISTS (
 SELECT 1 FROM candidates d WHERE d.robot_id=c.robot_id AND (
  d.priority>c.priority OR
  (d.priority=c.priority AND d.distance<c.distance) OR
  (d.priority=c.priority AND d.distance=c.distance AND d.y<c.y) OR
  (d.priority=c.priority AND d.distance=c.distance AND d.y=c.y AND d.x<c.x)
 )
);
